import { mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createServices,
  DbError,
  ensureDefaultWorkspace,
  openDatabase,
  openProjectFolder,
  type SecretCipher,
  type Services,
} from '@kiemi/db';
import { describeRunError, plainTranslator, vi } from '@kiemi/shared';
import { RunManager, type WorkerHandle } from '../main/run/run-manager';
import { InProcessWorker } from '../main/run/testing';
import type { RunArgs } from './args';
import { buildJunit, type JunitCase } from './junit';

export const EXIT = { ok: 0, failed: 1, usage: 2, system: 3 } as const;

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

export interface CliDeps {
  /** Engine process stand-in; tests may pass a fake browser. Default: the real engine in-process. */
  spawnWorker?: () => WorkerHandle;
  /** Where a downloaded Chromium lives. */
  browsersPath?: string;
}

/** The database never leaves memory, so secrets are not encrypted there (ADR 0022). */
const memoryCipher: SecretCipher = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain, 'utf8'),
  decrypt: (cipher) => cipher.toString('utf8'),
};

class UsageError extends Error {}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** One match by id or (case-insensitive) name; says what is available when there is none. */
function pick<T extends { id: string; name: string }>(list: T[], wanted: string, what: string): T {
  const hit = list.find((x) => x.id === wanted) ?? list.find((x) => same(x.name, wanted));
  if (!hit) {
    const names = list.map((x) => `"${x.name}"`).join(', ') || '(không có)';
    throw new UsageError(`Không tìm thấy ${what} "${wanted}". Có: ${names}`);
  }
  return hit;
}

const tVi = plainTranslator(vi);

/** Runs what `args` asks for and returns the process exit code. */
export async function execute(args: RunArgs, io: CliIo, deps: CliDeps = {}): Promise<number> {
  let services: Services;
  let projectId: string;
  try {
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    services = createServices({ db, workspaceId: seed.workspaceId }, memoryCipher);
    projectId = openProjectFolder(services, args.folder).projectId;
  } catch (err) {
    io.err(
      err instanceof DbError
        ? `Không mở được thư mục dự án "${args.folder}": ${err.message}`
        : `Không mở được thư mục dự án "${args.folder}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return EXIT.usage;
  }

  try {
    const project = services.projects.get(projectId);
    const envs = services.environments.list(projectId);
    const env = args.env ? pick(envs, args.env, 'môi trường') : undefined;
    if (args.timeoutSec) services.settings.update({ defaultTimeoutSec: args.timeoutSec });
    const target = args.suite
      ? ({
          kind: 'suite',
          suiteId: pick(services.suites.list(projectId), args.suite, 'suite').id,
        } as const)
      : args.test
        ? ({
            kind: 'test',
            testCaseId: pick(services.testCases.list(projectId), args.test, 'test').id,
          } as const)
        : ({ kind: 'tag', projectId, tag: args.tag ?? '' } as const);

    // Secrets are declared by the project's environments; only the ones asked for get a value.
    const runEnv = env ?? envs[0];
    const given = Object.entries(args.secrets);
    if (runEnv) {
      const known = new Set(services.environments.secretNames(runEnv.id));
      for (const [name, value] of given) {
        if (known.has(name)) services.environments.setSecret(runEnv.id, name, value);
      }
      const missing = services.environments.missingSecrets(runEnv.id);
      if (missing.length > 0)
        io.err(
          `Cảnh báo: môi trường "${runEnv.name}" thiếu bí mật ${missing.join(', ')} — truyền --secret TÊN=GIÁ_TRỊ.`,
        );
    }

    const artifactsRoot = args.results ?? mkdtempSync(join(tmpdir(), 'kiemi-cli-'));
    const runs = new RunManager({
      services,
      spawnWorker: deps.spawnWorker ?? (() => new InProcessWorker({})),
      artifactsRoot,
      browsersPath: deps.browsersPath ?? join(homedir(), '.kiemi', 'browsers'),
    });
    const startedAt = new Date();
    io.out(`Dự án: ${project.name}`);
    const { runId } = runs.start({
      target,
      ...(env ? { environmentId: env.id } : {}),
      options: { headless: args.headless },
    });
    for await (const _ of runs.events(runId)) {
      // the run is over when the feed ends
    }

    const run = services.runs.detail(runId);
    const testName = (id: string) => services.testCases.repo.find(id, true)?.name ?? id;
    const cases: JunitCase[] = run.cases.map((c) => {
      const err = c.steps.find((s) => s.error && s.status === 'failed')?.error ?? c.error;
      const row = c.rowIndex == null ? '' : ` (dòng ${c.rowIndex + 1})`;
      const status =
        (['passed', 'failed', 'error', 'skipped', 'cancelled'] as const).find(
          (s) => s === c.status,
        ) ?? 'error';
      return {
        classname: run.target?.name ?? project.name,
        name: `${testName(c.testCaseId)}${row}`,
        timeMs: c.durationMs ?? 0,
        status,
        message: err ? describeRunError(err, tVi).message : undefined,
      };
    });
    for (const c of cases) {
      const mark =
        c.status === 'passed'
          ? '✔'
          : c.status === 'skipped' || c.status === 'cancelled'
            ? '-'
            : '✘';
      io.out(`  ${mark} ${c.name}${c.message ? ` — ${c.message}` : ''}`);
    }
    const passed = cases.filter((c) => c.status === 'passed').length;
    io.out(`${passed}/${cases.length} test đạt · kết quả ở ${run.artifactDir ?? artifactsRoot}`);
    if (args.junit) {
      writeFileSync(
        args.junit,
        buildJunit({ name: run.target?.name ?? project.name, startedAt, cases }),
        'utf8',
      );
      io.out(`JUnit: ${args.junit}`);
    }
    if (run.status === 'error' || run.status === 'cancelled') return EXIT.system;
    return cases.every((c) => c.status === 'passed' || c.status === 'skipped')
      ? EXIT.ok
      : EXIT.failed;
  } catch (err) {
    if (err instanceof UsageError) {
      io.err(err.message);
      return EXIT.usage;
    }
    io.err(`Lỗi hệ thống: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT.system;
  }
}

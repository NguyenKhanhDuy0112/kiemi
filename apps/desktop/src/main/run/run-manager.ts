import { join } from 'node:path';
import { DbError, type RunRowStatus, type RunTarget, type Services } from '@kiemi/db';
import {
  type EngineEvent,
  environmentSkip,
  type RunRequest,
  type SavedLogin,
  type StepPhase,
} from '@kiemi/engine';
import type {
  ArtifactRef,
  Dataset,
  Env,
  RunError,
  RunResult,
  Secrets,
  TestCase,
} from '@kiemi/schema';
import { type OpenTunnel, prepareNetwork, type TunnelLike, usedProducts } from '../tunnel/network';
import type { HostToWorker, WorkerToHost } from './protocol';
import { type StartRunInput, StartRunInputSchema } from './start-input';

export type { StartRunInput } from './start-input';

/** One engine utility process, as seen by the main process. */
export interface WorkerHandle {
  send(msg: HostToWorker): void;
  onMessage(listener: (msg: WorkerToHost) => void): void;
  /** Fires once when the process is gone (normal exit, kill or crash). */
  onExit(listener: (code: number) => void): void;
  kill(): void;
}

export type { OpenTunnel, TunnelLike } from '../tunnel/network';

export interface RunManagerDeps {
  services: Services;
  spawnWorker: () => WorkerHandle;
  /** Default parent folder of `<runId>/` artifact folders (`userData/runs`). */
  artifactsRoot: string;
  /** Where a downloaded Chromium lives (`userData/browsers`). */
  browsersPath: string;
  /** Opens one SSH tunnel; called once per distinct SSH setting of the cells a run uses [O-02]. */
  openTunnel?: OpenTunnel;
  /** Grace period after Stop before the engine process is killed. */
  cancelKillMs?: number;
}

export type FinalStatus = Exclude<RunRowStatus, 'queued' | 'running'>;

/** One test case × dataset row of a run. */
export interface PlannedCase {
  runCaseId: string;
  testCaseId: string;
  testName: string;
  rowIndex?: number | undefined;
  /** Not run: the test is limited to other environments [O-06]. */
  skipped?: RunError | undefined;
}

/** What the renderer receives while a run progresses [N-05, S-03]. */
export type RunFeedEvent =
  | { type: 'plan'; runId: string; target: RunTarget; cases: PlannedCase[] }
  | { type: 'status'; runId: string; status: RunRowStatus; error?: RunError }
  | { type: 'download'; runId: string; percent: number }
  | {
      type: 'debug';
      runId: string;
      runCaseId: string;
      state: 'paused' | 'running';
      stepId: string;
      stepNo: string;
    }
  | { type: 'engine'; runId: string; runCaseId: string; event: EngineEvent };

interface StepInfo {
  phase: StepPhase;
  stepNo: string;
  session: string;
  parentStepId?: string | undefined;
}

interface ActiveRun {
  runId: string;
  projectId: string;
  history: RunFeedEvent[];
  listeners: Set<() => void>;
  finished: boolean;
  cancelRequested: boolean;
  worker?: WorkerHandle;
  tunnel?: TunnelLike;
  caseIds: Set<string>;
  openCases: Set<string>;
  /** Artifact sub-folder of each case, relative to the run folder ('' = the run folder). */
  caseDirs: Map<string, string>;
  steps: Map<string, StepInfo>;
}

interface CasePlan {
  testCase: TestCase;
  dataset?: Dataset | undefined;
  rowIndex?: number | undefined;
}

const KEEP_FINISHED = 20;

function datasetOf(
  tc: TestCase,
  services: Services,
  overrideId?: string | null,
  environmentId?: string | null,
): Dataset | undefined {
  // Saved datasets may have their own rows on this environment [O-05].
  if (overrideId) return services.datasets.forRun(overrideId, environmentId);
  const src = tc.dataset;
  if (!src) return undefined;
  if (src.source === 'table')
    return { id: 'table', name: 'table', columns: src.columns, rows: src.rows };
  if (src.source === 'saved') return services.datasets.forRun(src.datasetId, environmentId);
  // Excel/CSV files are imported into a table / saved dataset by the editor.
  return undefined;
}

/** One case per dataset row (or a single case without data). */
function expand(tc: TestCase, dataset: Dataset | undefined, rowIndex?: number): CasePlan[] {
  if (rowIndex !== undefined) return [{ testCase: tc, dataset, rowIndex }];
  if (dataset?.rows.length)
    return dataset.rows.map((_, i) => ({ testCase: tc, dataset, rowIndex: i }));
  return [{ testCase: tc, dataset }];
}

function overall(results: RunResult[], cancelled: boolean): FinalStatus {
  if (results.some((r) => r.status === 'error')) return 'error';
  if (cancelled || results.some((r) => r.status === 'cancelled')) return 'cancelled';
  if (results.some((r) => r.status === 'failed')) return 'failed';
  return 'passed';
}

const withDir = (dir: string, a: ArtifactRef): ArtifactRef =>
  dir ? { ...a, path: `${dir}/${a.path}` } : a;

/**
 * Starts runs (one test, a suite or a tag) in the engine utility process,
 * records progress in the DB and streams it to the renderer [N-05, H-01…H-04].
 * An engine crash marks the run `error`; the app keeps working.
 */
export class RunManager {
  readonly #d: RunManagerDeps;
  readonly #runs = new Map<string, ActiveRun>();

  constructor(deps: RunManagerDeps) {
    this.#d = deps;
  }

  /** Validates and records the run, then runs it in the background. Returns the run id. */
  start(raw: StartRunInput): { runId: string } {
    const input = StartRunInputSchema.parse(raw);
    const s = this.#d.services;
    const opts = input.options;

    // What to run [H-01].
    let projectId: string;
    let target: RunTarget;
    let suiteId: string | null = null;
    let suiteVariables: Record<string, string> | undefined;
    let defaultEnv: string | null | undefined;
    let plans: CasePlan[] = [];
    const t = input.target;
    /** Environment of the run (known before the data: datasets differ per environment). */
    const envFor = (pid: string, suiteEnv?: string | null): string | null =>
      input.environmentId === undefined
        ? (suiteEnv ?? s.environments.list(pid)[0]?.id ?? null)
        : input.environmentId;
    if (t.kind === 'test') {
      const row = s.testCases.get(t.testCaseId);
      projectId = row.projectId;
      target = { kind: 'test', testCaseId: row.id, name: row.name };
      const content = s.testCases.forRun(row.id);
      plans = expand(content, datasetOf(content, s, null, envFor(projectId)), t.rowIndex);
    } else if (t.kind === 'suite') {
      const suite = s.suites.get(t.suiteId);
      projectId = suite.projectId;
      suiteId = suite.id;
      target = { kind: 'suite', suiteId: suite.id, name: suite.name };
      suiteVariables = suite.variables;
      defaultEnv = suite.environmentId;
      for (const item of suite.items) {
        if (!item.enabled) continue;
        const row = s.testCases.repo.find(item.testCaseId);
        if (!row) continue;
        const content = s.testCases.forRun(row.id);
        plans.push(
          ...expand(
            content,
            datasetOf(content, s, item.datasetId, envFor(projectId, suite.environmentId)),
          ),
        );
      }
    } else {
      projectId = t.projectId;
      target = { kind: 'tag', tag: t.tag, name: t.tag };
      const tag = t.tag.toLowerCase();
      for (const summary of s.testCases.list(projectId)) {
        if (!summary.tags.some((x) => x.toLowerCase() === tag)) continue;
        const content = s.testCases.forRun(summary.id);
        plans.push(...expand(content, datasetOf(content, s, null, envFor(projectId))));
      }
    }

    // Where to run it [H-02].
    const environmentId =
      input.environmentId === undefined
        ? (defaultEnv ?? s.environments.list(projectId)[0]?.id ?? null)
        : input.environmentId;
    const { env, secrets } = environmentId
      ? s.environments.forRun(environmentId)
      : { env: undefined, secrets: {} };
    // Production & co.: the UI must have asked twice [O-03, W-10].
    if (env?.protected && input.confirmProtected !== true)
      throw new DbError('CONFIRM_REQUIRED', `Environment "${env.name}" is protected`, {
        environment: env.name,
        environmentId: env.id,
        type: env.type,
      });
    const settings = s.settings.getAll();
    // Project steps plus the workspace library, called by id [O-07].
    const sharedSteps = [
      ...s.sharedSteps.forRun(projectId),
      ...s.sharedResources.sharedStepsForRun(),
    ];
    // Inherited variables [O-04]: workspace → project → the test's product.
    const workspaceVars = settings.workspaceVariables;
    const projectVars = s.projects.get(projectId).variables ?? {};
    const productVars = new Map(
      s.products.list(projectId).map((p) => [p.key, p.variables ?? {}] as const),
    );
    // Stored as Playwright gave it (`storageState()`); the DB only checks the outline.
    const savedLogins = s.savedLogins.forRun(projectId) as unknown as Record<string, SavedLogin>;

    const run = s.runs.create({ projectId, environmentId, suiteId, artifactDir: '', target });
    const artifactDir = join(settings.resultsDir || this.#d.artifactsRoot, run.id);
    s.runs.repo.update(run.id, { artifactDir });

    const active: ActiveRun = {
      runId: run.id,
      projectId,
      history: [],
      listeners: new Set(),
      finished: false,
      cancelRequested: false,
      caseIds: new Set(),
      openCases: new Set(),
      caseDirs: new Map(),
      steps: new Map(),
    };
    this.#runs.set(run.id, active);
    this.#trim();

    const planned: PlannedCase[] = [];
    const requests: RunRequest[] = [];
    plans.forEach((p, i) => {
      const c = s.runs.addCase({ runId: run.id, testCaseId: p.testCase.id, rowIndex: p.rowIndex });
      const dir = plans.length > 1 ? `case-${i + 1}` : '';
      active.caseIds.add(c.id);
      const base = {
        runCaseId: c.id,
        testCaseId: p.testCase.id,
        testName: p.testCase.name,
        ...(p.rowIndex === undefined ? {} : { rowIndex: p.rowIndex }),
      };
      // Limited to other environments: recorded as skipped with the reason, never run [O-06].
      const skip = environmentSkip(p.testCase, env);
      if (skip) {
        const error: RunError = {
          code: 'ENV_SKIPPED',
          message: skip.reason ?? `Skipped on environment ${skip.environment}`,
          details: {
            environment: skip.environment,
            ...(skip.reason ? { reason: skip.reason } : {}),
          },
        };
        s.runs.abortCase(c.id, 'skipped', error);
        planned.push({ ...base, skipped: error });
        return;
      }
      active.openCases.add(c.id);
      active.caseDirs.set(c.id, dir);
      planned.push(base);
      requests.push({
        runId: c.id,
        testCase: p.testCase,
        ...(env ? { env } : {}),
        secrets,
        ...(p.dataset ? { dataset: p.dataset } : {}),
        ...(p.rowIndex === undefined ? {} : { rowIndex: p.rowIndex }),
        sharedSteps,
        savedLogins,
        variables: {
          workspace: workspaceVars,
          project: projectVars,
          product:
            productVars.get(p.testCase.product ?? env?.defaultProduct ?? '') ??
            ({} as Record<string, string>),
        },
        ...(suiteVariables ? { suiteVariables } : {}),
        options: {
          defaultStepTimeoutMs: settings.defaultTimeoutSec * 1000,
          ...(opts.startAtStepId && t.kind === 'test' ? { startAtStepId: opts.startAtStepId } : {}),
          artifacts: {
            dir: dir ? join(artifactDir, dir) : artifactDir,
            screenshots: opts.screenshots ?? 'onFailure',
            video: opts.video === true,
            trace: opts.trace === true,
          },
        },
      });
    });

    this.#publish(active, { type: 'plan', runId: run.id, target, cases: planned });
    this.#publish(active, { type: 'status', runId: run.id, status: 'queued' });
    if (requests.length === 0) {
      this.#finish(active, 'passed');
      return { runId: run.id };
    }
    const debugging = (opts.breakpoints?.length ?? 0) > 0 || opts.pauseAtStart === true;
    void this.#execute(
      active,
      {
        type: 'start',
        requests,
        launch: {
          settings: {
            browser: settings.browser,
            // Debugging needs a visible browser [S-03].
            headless: debugging ? false : (opts.headless ?? settings.headless),
            ...(opts.slowMoMs ? { slowMoMs: opts.slowMoMs } : {}),
          },
          browsersPath: this.#d.browsersPath,
        },
        stopOnFailure: opts.stopOnFailure === true,
        debug: {
          breakpoints: opts.breakpoints ?? [],
          pauseAtStart: opts.pauseAtStart === true,
        },
      },
      env,
      secrets,
    );
    return { runId: run.id };
  }

  /** Stop button: the engine still runs cleanup steps, then the run ends `cancelled`. */
  cancel(runId: string): boolean {
    const active = this.#runs.get(runId);
    if (!active || active.finished) return false;
    active.cancelRequested = true;
    if (active.worker) {
      active.worker.send({ type: 'cancel' });
      const w = active.worker;
      setTimeout(() => {
        if (!active.finished) w.kill();
      }, this.#d.cancelKillMs ?? 15_000).unref?.();
    }
    return true;
  }

  /** Tạm dừng / Tiếp tục / Bước tiếp / breakpoints while running [S-03, H-03]. */
  control(
    runId: string,
    cmd:
      | { type: 'pause' }
      | { type: 'resume' }
      | { type: 'step' }
      | { type: 'breakpoints'; stepIds: string[] },
  ): boolean {
    const active = this.#runs.get(runId);
    if (!active || active.finished || !active.worker) return false;
    active.worker.send(cmd);
    return true;
  }

  isRunning(runId: string): boolean {
    const a = this.#runs.get(runId);
    return a !== undefined && !a.finished;
  }

  /** Every event of the run so far, then live ones, until the run ends. */
  async *events(runId: string, signal?: AbortSignal): AsyncGenerator<RunFeedEvent> {
    const active = this.#runs.get(runId);
    if (!active) return;
    let next = 0;
    let wake: (() => void) | undefined;
    const notify = () => wake?.();
    active.listeners.add(notify);
    signal?.addEventListener('abort', notify);
    try {
      while (!signal?.aborted) {
        while (next < active.history.length) {
          yield active.history[next++] as RunFeedEvent;
        }
        if (active.finished) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
    } finally {
      active.listeners.delete(notify);
      signal?.removeEventListener('abort', notify);
    }
  }

  /** Stops every run (app quit). */
  async shutdown(): Promise<void> {
    for (const a of this.#runs.values()) {
      if (!a.finished) {
        a.cancelRequested = true;
        a.worker?.kill();
      }
      await a.tunnel?.close().catch(() => undefined);
    }
  }

  async #execute(
    active: ActiveRun,
    start: Extract<HostToWorker, { type: 'start' }>,
    env: Env | undefined,
    secrets: Secrets,
  ): Promise<void> {
    const s = this.#d.services;
    s.runs.markRunning(active.runId);
    this.#publish(active, { type: 'status', runId: active.runId, status: 'running' });

    let msg = start;
    if (env) {
      try {
        // Each product's cell may need its own SSH tunnel / proxy [O-02].
        const net = await prepareNetwork({
          env,
          secrets,
          used: usedProducts(
            env,
            start.requests.map((r) => r.testCase),
            start.requests[0]?.sharedSteps ?? [],
          ),
          openTunnel: this.#d.openTunnel,
        });
        active.tunnel = { proxyUrl: net.env.proxy?.server ?? '', close: net.close };
        const proxied = net.env;
        msg = { ...start, requests: start.requests.map((r) => ({ ...r, env: proxied })) };
      } catch (err) {
        this.#finish(active, 'error', {
          code: 'SSH_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    }
    if (active.cancelRequested) {
      this.#finish(active, 'cancelled');
      return;
    }

    let worker: WorkerHandle;
    try {
      worker = this.#d.spawnWorker();
    } catch (err) {
      this.#finish(active, 'error', {
        code: 'ENGINE_CRASHED',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    active.worker = worker;
    worker.onMessage((m) => this.#onMessage(active, m));
    worker.onExit((code) => {
      if (active.finished) return;
      if (active.cancelRequested) this.#finish(active, 'cancelled');
      else
        this.#finish(active, 'error', {
          code: 'ENGINE_CRASHED',
          message: `Engine process exited with code ${code}`,
          details: { exitCode: code },
        });
    });
    worker.send(msg);
  }

  #onMessage(active: ActiveRun, msg: WorkerToHost): void {
    if (active.finished) return;
    const runId = active.runId;
    switch (msg.type) {
      case 'ready':
        return;
      case 'download':
        this.#publish(active, { type: 'download', runId, percent: msg.progress.percent });
        return;
      case 'debug':
        this.#publish(active, {
          type: 'debug',
          runId,
          runCaseId: msg.runCaseId,
          state: msg.state,
          stepId: msg.stepId,
          stepNo: msg.stepNo,
        });
        return;
      case 'event': {
        const caseId = msg.event.runId;
        if (!active.caseIds.has(caseId)) return;
        if (msg.event.type === 'loginSaved') {
          // Cookies: stored encrypted, never sent to the UI [F-02, N-07].
          this.#saveLogin(active.projectId, msg.event.name, msg.event.login);
          return;
        }
        const event = this.#prefixArtifacts(active, msg.event);
        this.#record(active, event);
        this.#publish(active, { type: 'engine', runId, runCaseId: caseId, event });
        return;
      }
      case 'done':
        this.#finish(active, overall(msg.results, active.cancelRequested));
        return;
      case 'fatal':
        this.#finish(active, active.cancelRequested ? 'cancelled' : 'error', msg.error);
        return;
    }
  }

  #saveLogin(projectId: string, name: string, login: SavedLogin): void {
    try {
      this.#d.services.savedLogins.save(projectId, name, login.state, new Date(login.expiresAt));
    } catch {
      // No OS encryption: the login is simply not kept; later "use login" steps say so.
    }
  }

  /** Makes artifact paths relative to the run folder (cases have sub-folders). */
  #prefixArtifacts(active: ActiveRun, e: EngineEvent): EngineEvent {
    const dir = active.caseDirs.get(e.runId) ?? '';
    if (!dir) return e;
    switch (e.type) {
      case 'artifact':
        return { ...e, artifact: withDir(dir, e.artifact) };
      case 'stepEnd':
        return {
          ...e,
          result: { ...e.result, artifacts: e.result.artifacts.map((a) => withDir(dir, a)) },
        };
      case 'runEnd':
        return {
          ...e,
          result: { ...e.result, artifacts: e.result.artifacts.map((a) => withDir(dir, a)) },
        };
      default:
        return e;
    }
  }

  /** Persists engine progress (run_cases / run_steps / artifacts). */
  #record(active: ActiveRun, e: EngineEvent): void {
    const s = this.#d.services.runs;
    const caseId = e.runId;
    try {
      switch (e.type) {
        case 'runStart':
          s.startCase(caseId);
          return;
        case 'stepStart':
          active.steps.set(`${caseId}:${e.stepId}`, {
            phase: e.phase,
            stepNo: e.stepNo ?? String(e.index + 1),
            session: e.session,
            parentStepId: e.parentStepId,
          });
          return;
        case 'stepEnd': {
          const info = active.steps.get(`${caseId}:${e.result.stepId}`);
          const step = s.recordStep({
            runCaseId: caseId,
            result: e.result,
            phase: info?.phase ?? e.phase,
            stepNo: info?.stepNo ?? String(e.index + 1),
            session: info?.session ?? e.result.session,
            parentStepId: e.parentStepId ?? info?.parentStepId,
          });
          for (const artifact of e.result.artifacts) {
            s.addArtifact({ runId: active.runId, runCaseId: caseId, runStepId: step.id, artifact });
          }
          return;
        }
        case 'runEnd':
          s.finishCase(caseId, e.result);
          for (const artifact of e.result.artifacts) {
            s.addArtifact({ runId: active.runId, runCaseId: caseId, artifact });
          }
          active.openCases.delete(caseId);
          return;
        default:
          return;
      }
    } catch {
      // A failed DB write must not break the live view; the result still streams.
    }
  }

  #finish(active: ActiveRun, status: FinalStatus, error?: RunError): void {
    if (active.finished) return;
    const s = this.#d.services.runs;
    for (const caseId of active.openCases) {
      try {
        // Cases left after "stop on first failure" are skipped [H-04].
        const left = status === 'cancelled' || status === 'error' ? status : 'skipped';
        s.abortCase(caseId, left, left === 'error' ? error : undefined);
      } catch {
        // ignore
      }
    }
    active.openCases.clear();
    try {
      s.finish(active.runId, status);
    } catch {
      // ignore: the feed below still tells the UI.
    }
    active.finished = true;
    this.#publish(active, {
      type: 'status',
      runId: active.runId,
      status,
      ...(error ? { error } : {}),
    });
    active.worker?.kill();
    void active.tunnel?.close().catch(() => undefined);
  }

  #publish(active: ActiveRun, event: RunFeedEvent): void {
    active.history.push(event);
    for (const l of active.listeners) l();
  }

  /** Keeps the event history of only the latest finished runs in memory. */
  #trim(): void {
    const finished = [...this.#runs.values()].filter((r) => r.finished);
    for (const r of finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED))) {
      this.#runs.delete(r.runId);
    }
  }
}

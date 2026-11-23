import {
  LocatorSchema,
  ProxySchema,
  parseTestCase,
  SharedStepSchema,
  SshSettingsSchema,
  type TestCase,
} from '@kiemi/schema';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import { DbError } from '../repo';
import type { Services } from '../services';

/** Manifest of a `.zip` bundle (project or suite export) [J-03]. */
export const BUNDLE_FORMAT = 'kiemi-bundle';
export const BUNDLE_VERSION = 1;
const MANIFEST = 'kiemi.json';
const MAX_ENTRIES = 5000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

const ManifestSchema = z.object({
  format: z.literal(BUNDLE_FORMAT),
  formatVersion: z.number().int().positive(),
  kind: z.enum(['project', 'suite']),
  exportedAt: z.string(),
  project: z.object({ name: z.string().min(1), description: z.string().nullish() }),
  folders: z
    .array(
      z.object({
        id: z.string(),
        parentId: z.string().nullable(),
        name: z.string().min(1),
        sortOrder: z.number().int(),
      }),
    )
    .default([]),
  tests: z
    .array(z.object({ id: z.string(), folderId: z.string().nullable(), file: z.string().min(1) }))
    .default([]),
  environments: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        baseUrl: z.string().nullish(),
        proxy: ProxySchema.nullish(),
        ssh: SshSettingsSchema.nullish(),
        variables: z.record(z.string(), z.string()).default({}),
        /** Secret names only: values are never exported. */
        secretNames: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  sharedSteps: z.array(SharedStepSchema).default([]),
  elements: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        locator: LocatorSchema,
        pageUrl: z.string().nullish(),
      }),
    )
    .default([]),
  datasets: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        columns: z.array(z.string()),
        rows: z.array(z.record(z.string(), z.string())),
        source: z.object({
          kind: z.enum(['manual', 'excel', 'csv']),
          fileName: z.string().optional(),
          sheet: z.string().optional(),
        }),
      }),
    )
    .default([]),
  suites: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        description: z.string().nullish(),
        variables: z.record(z.string(), z.string()).default({}),
        environmentId: z.string().nullish(),
        items: z.array(
          z.object({
            testCaseId: z.string(),
            datasetId: z.string().nullish(),
            enabled: z.boolean(),
          }),
        ),
      }),
    )
    .default([]),
});
export type BundleManifest = z.infer<typeof ManifestSchema>;

/** File-name-safe version of a test name (keeps Vietnamese letters). */
export function safeFileName(name: string): string {
  const s = [...name]
    // Characters not allowed in Windows/macOS file names, and control characters.
    .map((ch) => (ch.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 100);
  return s || 'test';
}

/** One test as a `.kiemi.json` file (pretty-printed) [J-03]. */
export function exportTestCase(
  services: Services,
  id: string,
): { fileName: string; content: string } {
  const row = services.testCases.get(id);
  return {
    fileName: `${safeFileName(row.name)}.kiemi.json`,
    content: `${JSON.stringify(row.content, null, 2)}\n`,
  };
}

export interface ImportReport {
  projectId: string;
  testCaseIds: string[];
  /** `call` steps pointing at shared steps that are not in the project. */
  missingSharedSteps: string[];
  /** Secrets to enter again (values are never exported), by environment. */
  missingSecrets: { environment: string; names: string[] }[];
  /** Files that could not be read, with the reason. */
  skipped: { file: string; reason: string }[];
}

function parseDocument(text: string): TestCase {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DbError('IMPORT_FAILED', 'The file is not valid JSON', { reason: 'badJson' });
  }
  try {
    return parseTestCase(json).testCase;
  } catch (err) {
    const reason = err instanceof z.ZodError ? 'invalid' : 'migration';
    throw new DbError('IMPORT_FAILED', err instanceof Error ? err.message : String(err), {
      reason,
    });
  }
}

/** Replaces `call.shared` ids in steps (deep) and returns the unknown ones. */
function remapShared(
  value: unknown,
  map: ReadonlyMap<string, string>,
  known: ReadonlySet<string>,
  missing: Set<string>,
): unknown {
  if (Array.isArray(value)) return value.map((v) => remapShared(v, map, known, missing));
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = remapShared(v, map, known, missing);
  if (
    obj.action === 'call' &&
    typeof (obj.params as Record<string, unknown> | undefined)?.shared === 'string'
  ) {
    const params = out.params as Record<string, unknown>;
    const old = params.shared as string;
    const next = map.get(old) ?? old;
    params.shared = next;
    if (!known.has(next)) missing.add(old);
  }
  return out;
}

/** Imports one `.kiemi.json` (any older schema version) into a project [J-03, N-08]. */
export function importTestCase(
  services: Services,
  projectId: string,
  folderId: string | null,
  text: string,
): ImportReport {
  services.projects.get(projectId);
  const doc = parseDocument(text);
  const known = new Set(services.sharedSteps.list(projectId).map((s) => s.id));
  const missing = new Set<string>();
  const content = remapShared(doc, new Map(), known, missing) as TestCase;
  const row = services.testCases.insertDocument(projectId, folderId, content);
  return {
    projectId,
    testCaseIds: [row.id],
    missingSharedSteps: [...missing],
    missingSecrets: [],
    skipped: [],
  };
}

/** Whole project — or one suite with what it needs — as a `.zip` [J-03]. */
export function exportBundle(
  services: Services,
  target: { projectId: string } | { suiteId: string },
): { fileName: string; data: Uint8Array } {
  const suite = 'suiteId' in target ? services.suites.get(target.suiteId) : undefined;
  const projectId = suite?.projectId ?? (target as { projectId: string }).projectId;
  const project = services.projects.get(projectId);

  const allTests = services.testCases.list(projectId);
  const wanted = suite ? new Set(suite.items.map((i) => i.testCaseId)) : undefined;
  const tests = allTests.filter((t) => !wanted || wanted.has(t.id));
  const folders = suite ? [] : services.folders.list(projectId);
  const suites = suite
    ? [suite]
    : services.suites.list(projectId).map((s) => services.suites.get(s.id));
  const datasetIds = suite
    ? new Set(suite.items.map((i) => i.datasetId).filter((x): x is string => !!x))
    : undefined;

  const files: Record<string, Uint8Array> = {};
  const usedPaths = new Set<string>();
  const folderPath = (id: string | null): string => {
    if (!id || suite) return '';
    const f = folders.find((x) => x.id === id);
    return f ? `${folderPath(f.parentId)}${safeFileName(f.name)}/` : '';
  };
  const testEntries = tests.map((t) => {
    let path = `tests/${folderPath(t.folderId)}${safeFileName(t.name)}.kiemi.json`;
    for (let n = 2; usedPaths.has(path.toLowerCase()); n++)
      path = `tests/${folderPath(t.folderId)}${safeFileName(t.name)} (${n}).kiemi.json`;
    usedPaths.add(path.toLowerCase());
    files[path] = strToU8(`${JSON.stringify(services.testCases.get(t.id).content, null, 2)}\n`);
    return { id: t.id, folderId: suite ? null : t.folderId, file: path };
  });

  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_VERSION,
    kind: suite ? 'suite' : 'project',
    exportedAt: new Date().toISOString(),
    project: { name: project.name, description: project.description },
    folders: folders.map((f) => ({
      id: f.id,
      parentId: f.parentId,
      name: f.name,
      sortOrder: f.sortOrder,
    })),
    tests: testEntries,
    environments: services.environments.list(projectId).map((e) => ({
      id: e.id,
      name: e.name,
      baseUrl: e.baseUrl,
      proxy: e.proxy,
      ssh: e.ssh,
      variables: services.environments.variables(e.id),
      secretNames: services.environments.secretNames(e.id),
    })),
    sharedSteps: services.sharedSteps.forRun(projectId),
    elements: services.elements
      .list(projectId)
      .map((el) => ({ id: el.id, name: el.name, locator: el.locator, pageUrl: el.pageUrl })),
    datasets: services.datasets
      .list(projectId)
      .filter((d) => !datasetIds || datasetIds.has(d.id))
      .map((d) => ({ id: d.id, name: d.name, columns: d.columns, rows: d.rows, source: d.source })),
    suites: suites.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      variables: s.variables,
      environmentId: s.environmentId,
      items: s.items.map((i) => ({
        testCaseId: i.testCaseId,
        datasetId: i.datasetId,
        enabled: i.enabled,
      })),
    })),
  };
  files[MANIFEST] = strToU8(JSON.stringify(manifest, null, 2));
  const name = suite
    ? `${safeFileName(project.name)} - ${safeFileName(suite.name)}`
    : safeFileName(project.name);
  return { fileName: `${name}.zip`, data: zipSync(files, { level: 6 }) };
}

function readZip(data: Uint8Array): Record<string, Uint8Array> {
  let entries: Record<string, Uint8Array>;
  let total = 0;
  let count = 0;
  try {
    entries = unzipSync(data, {
      filter: (f) => {
        count++;
        total += f.originalSize;
        if (count > MAX_ENTRIES || total > MAX_TOTAL_BYTES) throw new Error('too large');
        return !f.name.endsWith('/');
      },
    });
  } catch (err) {
    const tooLarge = err instanceof Error && err.message === 'too large';
    throw new DbError(
      'IMPORT_FAILED',
      tooLarge ? 'The file is too large' : 'Not a valid .zip file',
      { reason: tooLarge ? 'tooLarge' : 'badZip' },
    );
  }
  return entries;
}

/**
 * Imports a project/suite `.zip` as a NEW project (fresh ids, references
 * remapped). Secrets are listed in the report to be entered again [J-03].
 */
export function importBundle(
  services: Services,
  data: Uint8Array,
  options: { projectName?: string } = {},
): ImportReport {
  const entries = readZip(data);
  const raw = entries[MANIFEST];
  if (!raw)
    throw new DbError('IMPORT_FAILED', 'This .zip was not exported by Kiemi', {
      reason: 'noManifest',
    });
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(strFromU8(raw));
  } catch {
    throw new DbError('IMPORT_FAILED', 'The bundle manifest is not valid JSON', {
      reason: 'badJson',
    });
  }
  const parsed = ManifestSchema.safeParse(manifestJson);
  if (!parsed.success) {
    const newer = (manifestJson as { formatVersion?: unknown } | null)?.formatVersion;
    throw new DbError('IMPORT_FAILED', 'Unsupported bundle', {
      reason: typeof newer === 'number' && newer > BUNDLE_VERSION ? 'newerVersion' : 'invalid',
    });
  }
  const m = parsed.data;
  if (m.formatVersion > BUNDLE_VERSION)
    throw new DbError('IMPORT_FAILED', 'Bundle from a newer Kiemi', { reason: 'newerVersion' });

  const report: ImportReport = {
    projectId: '',
    testCaseIds: [],
    missingSharedSteps: [],
    missingSecrets: [],
    skipped: [],
  };
  services.ctx.db.transaction(() => {
    const project = services.projects.create({
      name: options.projectName ?? m.project.name,
      description: m.project.description ?? null,
    });
    report.projectId = project.id;
    const ids = new Map<string, string>();

    // Folders: parents first.
    const pending = [...m.folders];
    for (let guard = 0; pending.length && guard < 10_000; guard++) {
      const i = pending.findIndex((f) => !f.parentId || ids.has(f.parentId));
      if (i < 0) break;
      const [f] = pending.splice(i, 1);
      if (!f) break;
      const row = services.folders.create({
        projectId: project.id,
        parentId: f.parentId ? ids.get(f.parentId) : null,
        name: f.name,
      });
      ids.set(f.id, row.id);
    }

    for (const s of m.sharedSteps) {
      ids.set(
        s.id,
        services.sharedSteps.create({
          projectId: project.id,
          name: s.name,
          params: s.params,
          steps: s.steps,
        }).id,
      );
    }
    const known = new Set([...ids.values()]);
    // Shared steps may call each other.
    for (const s of m.sharedSteps) {
      const id = ids.get(s.id) as string;
      const missing = new Set<string>();
      services.sharedSteps.update(id, {
        steps: remapShared(s.steps, ids, known, missing) as typeof s.steps,
      });
      for (const x of missing)
        if (!report.missingSharedSteps.includes(x)) report.missingSharedSteps.push(x);
    }

    for (const el of m.elements) {
      ids.set(
        el.id,
        services.elements.create({
          projectId: project.id,
          name: el.name,
          locator: el.locator,
          pageUrl: el.pageUrl ?? null,
        }).id,
      );
    }
    for (const d of m.datasets) {
      const row = services.datasets.create({
        projectId: project.id,
        name: d.name,
        columns: d.columns,
        rows: d.rows,
      });
      ids.set(d.id, row.id);
    }
    // The seed environment is not created for imported projects: take the bundle's.
    for (const e of m.environments) {
      const row = services.environments.create({
        projectId: project.id,
        name: e.name,
        baseUrl: e.baseUrl ?? null,
        proxy: e.proxy ?? null,
        ssh: e.ssh ?? null,
      });
      ids.set(e.id, row.id);
      services.environments.setVariables(row.id, e.variables);
      services.environments.setSecretNames(row.id, e.secretNames);
      if (e.secretNames.length)
        report.missingSecrets.push({ environment: e.name, names: e.secretNames });
    }

    for (const t of m.tests) {
      const file = entries[t.file];
      if (!file) {
        report.skipped.push({ file: t.file, reason: 'missing' });
        continue;
      }
      try {
        const missing = new Set<string>();
        const doc = remapShared(parseDocument(strFromU8(file)), ids, known, missing) as TestCase;
        const row = services.testCases.insertDocument(
          project.id,
          t.folderId ? (ids.get(t.folderId) ?? null) : null,
          doc,
        );
        ids.set(t.id, row.id);
        report.testCaseIds.push(row.id);
        for (const x of missing)
          if (!report.missingSharedSteps.includes(x)) report.missingSharedSteps.push(x);
      } catch (err) {
        report.skipped.push({
          file: t.file,
          reason: err instanceof DbError ? String(err.details?.reason ?? 'invalid') : 'invalid',
        });
      }
    }

    for (const s of m.suites) {
      const row = services.suites.create({
        projectId: project.id,
        name: s.name,
        description: s.description ?? null,
        variables: s.variables,
        environmentId: s.environmentId ? (ids.get(s.environmentId) ?? null) : null,
      });
      services.suites.setItems(
        row.id,
        s.items
          .filter((i) => ids.has(i.testCaseId))
          .map((i) => ({
            testCaseId: ids.get(i.testCaseId) as string,
            datasetId: i.datasetId ? (ids.get(i.datasetId) ?? null) : null,
            enabled: i.enabled,
          })),
      );
    }
  });
  return report;
}

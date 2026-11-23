import { parseTestCase } from '@kiemi/schema';
import { z } from 'zod';
import { safeFileName } from '../io/bundle';
import { DbError, newId } from '../repo';
import {
  DatasetFileSchema,
  ElementsFileSchema,
  EnvironmentsFileSchema,
  type FolderEntry,
  FoldersFileSchema,
  PATHS,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  ProjectFileSchema,
  type ProjectSnapshot,
  SharedStepFileSchema,
  SuiteFileSchema,
  stableJson,
  TEST_EXT,
  TESTS_DIR,
} from './format';

/** Relative posix path → file text. */
export type FileMap = Map<string, string>;

export interface FileProblem {
  path: string;
  reason: 'badJson' | 'invalid' | 'migration' | 'newerVersion';
}

const byKey =
  <T>(...keys: ((x: T) => string | number)[]) =>
  (a: T, b: T): number => {
    for (const k of keys) {
      const x = k(a);
      const y = k(b);
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  };

/** Gives each item a unique (case-insensitive) file name inside one directory. */
function uniqueNames<T>(items: T[], base: (x: T) => string, ext: string): Map<T, string> {
  const used = new Set<string>();
  const out = new Map<T, string>();
  for (const it of items) {
    const stem = safeFileName(base(it));
    let name = `${stem}${ext}`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} (${n})${ext}`;
    used.add(name.toLowerCase());
    out.set(it, name);
  }
  return out;
}

/** Folder id → directory under `tests/` (no leading/trailing slash). */
export function folderDirs(folders: readonly FolderEntry[]): Map<string, string> {
  const children = new Map<string | null, FolderEntry[]>();
  const ids = new Set(folders.map((f) => f.id));
  for (const f of folders) {
    const parent = f.parentId && ids.has(f.parentId) ? f.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(f);
    children.set(parent, list);
  }
  const out = new Map<string, string>();
  const walk = (parent: string | null, prefix: string, depth: number) => {
    if (depth > 64) return;
    const list = (children.get(parent) ?? []).sort(
      byKey(
        (f) => f.sortOrder,
        (f) => f.name,
        (f) => f.id,
      ),
    );
    const names = uniqueNames(list, (f) => f.name, '');
    for (const f of list) {
      const dir = `${prefix}${names.get(f) as string}`;
      out.set(f.id, dir);
      walk(f.id, `${dir}/`, depth + 1);
    }
  };
  walk(null, '', 0);
  return out;
}

/** Serializes a project the same way every time, so unchanged data gives unchanged files. */
export function snapshotToFiles(s: ProjectSnapshot): FileMap {
  const files: FileMap = new Map();
  files.set(
    PATHS.project,
    stableJson({
      format: PROJECT_FORMAT,
      formatVersion: PROJECT_FORMAT_VERSION,
      id: s.project.id,
      name: s.project.name,
      ...(s.project.description ? { description: s.project.description } : {}),
    }),
  );
  const folders = [...s.folders].sort(byKey((f) => f.id));
  files.set(
    PATHS.folders,
    stableJson({
      folders: folders.map((f) => ({
        id: f.id,
        parentId: f.parentId,
        name: f.name,
        sortOrder: f.sortOrder,
      })),
    }),
  );
  files.set(
    PATHS.environments,
    stableJson({
      environments: [...s.environments]
        .sort(
          byKey(
            (e) => e.sortOrder,
            (e) => e.id,
          ),
        )
        .map((e) => ({
          id: e.id,
          name: e.name,
          ...(e.baseUrl ? { baseUrl: e.baseUrl } : {}),
          ...(e.proxy ? { proxy: e.proxy } : {}),
          ...(e.ssh ? { ssh: e.ssh } : {}),
          variables: Object.fromEntries(Object.entries(e.variables).sort(byKey(([k]) => k))),
          secretNames: [...new Set(e.secretNames)].sort(),
          sortOrder: e.sortOrder,
        })),
    }),
  );
  files.set(
    PATHS.elements,
    stableJson({
      elements: [...s.elements]
        .sort(
          byKey(
            (e) => e.name,
            (e) => e.id,
          ),
        )
        .map((e) => ({
          id: e.id,
          name: e.name,
          locator: e.locator,
          ...(e.pageUrl ? { pageUrl: e.pageUrl } : {}),
        })),
    }),
  );

  const named = <T extends { id: string; name: string }>(
    dir: string,
    list: T[],
    body: (x: T) => unknown,
  ) => {
    const sorted = [...list].sort(
      byKey(
        (x) => x.name,
        (x) => x.id,
      ),
    );
    const names = uniqueNames(sorted, (x) => x.name, '.json');
    for (const x of sorted) files.set(`${dir}/${names.get(x)}`, stableJson(body(x)));
  };
  named(PATHS.sharedSteps, s.sharedSteps, (x) => ({
    id: x.id,
    name: x.name,
    params: x.params,
    steps: x.steps,
  }));
  named(PATHS.datasets, s.datasets, (x) => ({
    id: x.id,
    name: x.name,
    columns: x.columns,
    rows: x.rows,
    source: x.source,
  }));
  named(PATHS.suites, s.suites, (x) => ({
    id: x.id,
    name: x.name,
    ...(x.description ? { description: x.description } : {}),
    variables: x.variables,
    ...(x.environmentId ? { environmentId: x.environmentId } : {}),
    items: x.items.map((i) => ({
      testCaseId: i.testCaseId,
      ...(i.datasetId ? { datasetId: i.datasetId } : {}),
      enabled: i.enabled,
    })),
  }));

  const dirs = folderDirs(s.folders);
  const byDir = new Map<string, ProjectSnapshot['tests']>();
  for (const t of s.tests) {
    const dir = (t.folderId && dirs.get(t.folderId)) || '';
    const list = byDir.get(dir) ?? [];
    list.push(t);
    byDir.set(dir, list);
  }
  for (const [dir, list] of byDir) {
    const sorted = list.sort(
      byKey(
        (t) => t.content.name,
        (t) => t.id,
      ),
    );
    const names = uniqueNames(sorted, (t) => t.content.name, TEST_EXT);
    for (const t of sorted) {
      const path = `${TESTS_DIR}/${dir ? `${dir}/` : ''}${names.get(t)}`;
      files.set(path, stableJson({ ...t.content, id: t.id }));
    }
  }
  return files;
}

type Parsed = { ok: true; value: unknown } | { ok: false; reason: FileProblem['reason'] };

function parseJson(text: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: 'badJson' };
  }
}

/** Parses one managed file; `ok: false` = leave it alone (being edited, merge markers…). */
export function parseFile(path: string, text: string): Parsed {
  const json = parseJson(text);
  if (!json.ok) return json;
  const schema = schemaFor(path);
  if (schema === 'test') {
    try {
      return { ok: true, value: parseTestCase(json.value).testCase };
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, reason: 'invalid' };
      const code = (err as { code?: string }).code;
      return { ok: false, reason: code === 'NEWER_VERSION' ? 'newerVersion' : 'migration' };
    }
  }
  const r = schema.safeParse(json.value);
  if (!r.success) {
    const v = (json.value as { formatVersion?: unknown } | null)?.formatVersion;
    if (path === PATHS.project && typeof v === 'number' && v > PROJECT_FORMAT_VERSION)
      return { ok: false, reason: 'newerVersion' };
    return { ok: false, reason: 'invalid' };
  }
  if (path === PATHS.project && r.data.formatVersion > PROJECT_FORMAT_VERSION)
    return { ok: false, reason: 'newerVersion' };
  return { ok: true, value: r.data };
}

// biome-ignore lint/suspicious/noExplicitAny: each path has its own schema; callers narrow by path.
function schemaFor(path: string): z.ZodType<any> | 'test' {
  if (path === PATHS.project) return ProjectFileSchema;
  if (path === PATHS.folders) return FoldersFileSchema;
  if (path === PATHS.environments) return EnvironmentsFileSchema;
  if (path === PATHS.elements) return ElementsFileSchema;
  if (path.startsWith(`${PATHS.sharedSteps}/`)) return SharedStepFileSchema;
  if (path.startsWith(`${PATHS.datasets}/`)) return DatasetFileSchema;
  if (path.startsWith(`${PATHS.suites}/`)) return SuiteFileSchema;
  return 'test';
}

/**
 * Builds the project from its files. Unreadable files are reported and skipped;
 * new directories under `tests/` become folders; a copied file with an id already
 * used gets a new id (it becomes a copy).
 */
export function filesToSnapshot(files: FileMap): {
  snapshot: ProjectSnapshot;
  problems: FileProblem[];
} {
  const problems: FileProblem[] = [];
  const get = <T>(path: string): T | undefined => {
    const text = files.get(path);
    if (text === undefined) return undefined;
    const p = parseFile(path, text);
    if (!p.ok) {
      problems.push({ path, reason: p.reason });
      return undefined;
    }
    return p.value as T;
  };
  const project = get<z.infer<typeof ProjectFileSchema>>(PATHS.project);
  if (!project) {
    const reason = problems.find((p) => p.path === PATHS.project)?.reason;
    throw new DbError('FOLDER_INVALID', 'This folder is not a Kiemi project', {
      reason: reason ?? 'noProject',
    });
  }
  const folders = [...(get<z.infer<typeof FoldersFileSchema>>(PATHS.folders)?.folders ?? [])];
  const seen = new Set<string>();
  const unique = <T extends { id: string }>(x: T): T => {
    if (!seen.has(x.id)) {
      seen.add(x.id);
      return x;
    }
    const copy = { ...x, id: newId() };
    seen.add(copy.id);
    return copy;
  };
  const dedupedFolders = folders.map(unique);

  const paths = [...files.keys()].sort();
  const inDir = (dir: string) =>
    paths.filter((p) => p.startsWith(`${dir}/`) && p.endsWith('.json'));
  const list = <T extends { id: string }>(dir: string) =>
    inDir(dir)
      .map((p) => get<T>(p))
      .filter((x): x is T => x !== undefined)
      .map(unique);

  const snapshot: ProjectSnapshot = {
    project: { id: project.id, name: project.name, description: project.description ?? null },
    folders: dedupedFolders,
    tests: [],
    environments: (
      get<z.infer<typeof EnvironmentsFileSchema>>(PATHS.environments)?.environments ?? []
    ).map(unique),
    elements: (get<z.infer<typeof ElementsFileSchema>>(PATHS.elements)?.elements ?? []).map(unique),
    sharedSteps: list(PATHS.sharedSteps),
    datasets: list(PATHS.datasets),
    suites: list(PATHS.suites),
  };

  // Directory → folder id; unknown directories become folders.
  const dirToId = new Map<string, string>();
  for (const [fid, dir] of folderDirs(snapshot.folders)) dirToId.set(dir.toLowerCase(), fid);
  const folderFor = (dir: string): string | null => {
    if (!dir) return null;
    const known = dirToId.get(dir.toLowerCase());
    if (known) return known;
    const cut = dir.lastIndexOf('/');
    const parentId = folderFor(cut < 0 ? '' : dir.slice(0, cut));
    const f: FolderEntry = {
      id: newId(),
      parentId,
      name: dir.slice(cut + 1),
      sortOrder: snapshot.folders.filter((x) => x.parentId === parentId).length,
    };
    snapshot.folders.push(f);
    dirToId.set(dir.toLowerCase(), f.id);
    return f.id;
  };
  for (const path of paths) {
    if (!path.startsWith(`${TESTS_DIR}/`) || !path.endsWith(TEST_EXT)) continue;
    const content = get<ProjectSnapshot['tests'][number]['content']>(path);
    if (!content) continue;
    const rel = path.slice(TESTS_DIR.length + 1);
    const cut = rel.lastIndexOf('/');
    const t = unique({
      id: content.id,
      folderId: folderFor(cut < 0 ? '' : rel.slice(0, cut)),
      content,
    });
    snapshot.tests.push({ ...t, content: { ...t.content, id: t.id } });
  }
  return { snapshot, problems };
}

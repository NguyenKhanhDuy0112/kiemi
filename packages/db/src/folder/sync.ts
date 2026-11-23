import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { DbError } from '../repo';
import type { Services } from '../services';
import { projects } from '../tables';
import {
  deleteProjectFile,
  ensureGitignore,
  readProjectFiles,
  syncTestDirs,
  writeProjectFile,
} from './disk';
import {
  type FileMap,
  type FileProblem,
  filesToSnapshot,
  folderDirs,
  parseFile,
  snapshotToFiles,
} from './files';
import { hashText, normalizeText, PATHS, type ProjectFileSchema } from './format';
import { applySnapshot, readSnapshot } from './snapshot';

export type Side = 'local' | 'remote';

export interface SyncOptions {
  /** How to settle files changed on both sides. Unset = leave them as conflicts. */
  prefer?: Side;
  /** Per-file choice made by the user in the conflict dialog (M9-03). */
  resolve?: Readonly<Record<string, Side>>;
}

export interface SyncResult {
  /** Files written / deleted on disk (local changes). */
  written: string[];
  deleted: string[];
  /** Files whose on-disk change was loaded into the app. */
  loaded: string[];
  /** Changed on both sides and not settled: left untouched until the user chooses. */
  conflicts: string[];
  /** Files that could not be read (left untouched). */
  problems: FileProblem[];
}

/** Hash per path of a file map. */
function hashes(files: FileMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of files) out[k] = hashText(v);
  return out;
}

function saveState(services: Services, projectId: string, state: Record<string, string>) {
  // No version bump: the sync base is bookkeeping, not an edit the UI must see.
  services.ctx.db
    .update(projects)
    .set({ folderState: state })
    .where(eq(projects.id, projectId))
    .run();
}

/**
 * Three-way sync between the database (local), the project folder (remote) and the
 * state of the last sync (base), file by file (ADR 0018 §3).
 */
export function syncProjectFolder(
  services: Services,
  projectId: string,
  options: SyncOptions = {},
): SyncResult {
  const row = services.projects.get(projectId);
  const dir = row.folderPath;
  if (!dir) throw new DbError('FOLDER_INVALID', 'Project has no folder', { reason: 'noFolder' });
  if (!existsSync(dir) || !statSync(dir).isDirectory())
    throw new DbError('FOLDER_INVALID', 'Project folder not found', { reason: 'missing', dir });

  const remote = readProjectFiles(dir);
  const remoteProject = remote.get(PATHS.project);
  if (remoteProject !== undefined) {
    const p = parseFile(PATHS.project, remoteProject);
    if (p.ok && (p.value as { id: string }).id !== projectId)
      throw new DbError('FOLDER_INVALID', 'The folder holds another project', {
        reason: 'otherProject',
        dir,
      });
  }
  const base = row.folderState ?? {};
  const local = snapshotToFiles(readSnapshot(services, projectId));
  const merged: FileMap = new Map(local);
  const result: SyncResult = { written: [], deleted: [], loaded: [], conflicts: [], problems: [] };
  const frozen = new Set<string>();

  const takeRemote = (path: string) => {
    const text = remote.get(path);
    if (text === undefined) {
      merged.delete(path);
      result.loaded.push(path);
      return;
    }
    const parsed = parseFile(path, text);
    if (!parsed.ok) {
      result.problems.push({ path, reason: parsed.reason });
      frozen.add(path);
      return;
    }
    merged.set(path, text);
    result.loaded.push(path);
  };

  for (const path of new Set([...local.keys(), ...remote.keys()])) {
    const l = local.has(path) ? hashText(local.get(path) as string) : undefined;
    const r = remote.has(path) ? hashText(remote.get(path) as string) : undefined;
    const b = base[path];
    if (l === r) continue;
    if (r === b) continue; // Local change: written below.
    if (l === b) {
      takeRemote(path);
      continue;
    }
    const choice = options.resolve?.[path] ?? options.prefer;
    if (choice === 'remote') takeRemote(path);
    else if (choice !== 'local') {
      result.conflicts.push(path);
      frozen.add(path);
    }
  }

  if (result.loaded.length) {
    const { snapshot, problems } = filesToSnapshot(merged);
    for (const p of problems) if (!frozen.has(p.path)) result.problems.push(p);
    snapshot.project.id = projectId;
    applySnapshot(services, snapshot);
  }

  const finalSnap = readSnapshot(services, projectId);
  const final = snapshotToFiles(finalSnap);
  for (const path of new Set([...final.keys(), ...remote.keys()])) {
    if (frozen.has(path)) continue;
    const want = final.get(path);
    const have = remote.get(path);
    if (want === have) continue;
    if (want === undefined) {
      deleteProjectFile(dir, path);
      result.deleted.push(path);
    } else {
      writeProjectFile(dir, path, want);
      result.written.push(path);
    }
  }
  syncTestDirs(dir, [
    ...finalSnap.products.map((p) => p.key),
    ...folderDirs(finalSnap.folders, finalSnap.products).values(),
  ]);
  ensureGitignore(dir);

  const state = hashes(final);
  for (const path of frozen) {
    if (base[path] !== undefined) state[path] = base[path];
    else delete state[path];
  }
  saveState(services, projectId, state);
  return result;
}

/** Is `dir` free to become a project folder (missing, empty, or no Kiemi project yet)? */
function assertFreeFolder(dir: string): void {
  if (!existsSync(dir)) return;
  if (!statSync(dir).isDirectory())
    throw new DbError('FOLDER_INVALID', 'Not a folder', { reason: 'notFolder', dir });
  if (existsSync(join(dir, '.kiemi', 'project.json')))
    throw new DbError('FOLDER_INVALID', 'The folder already holds a project', {
      reason: 'otherProject',
      dir,
    });
}

/**
 * Saves a database-only project into a (new or empty) folder and links them —
 * used to move v1.0 projects and for new projects [T-01, M9-02].
 */
export function attachProjectFolder(
  services: Services,
  projectId: string,
  dir: string,
): SyncResult {
  const folder = resolve(dir);
  assertFreeFolder(folder);
  mkdirSync(folder, { recursive: true });
  services.ctx.db
    .update(projects)
    .set({ folderPath: folder, folderState: {} })
    .where(eq(projects.id, projectId))
    .run();
  return syncProjectFolder(services, projectId, { prefer: 'local' });
}

/** Reads the project id/name of a folder (FOLDER_INVALID if it is not a project). */
export function readProjectHeader(dir: string): {
  id: string;
  name: string;
  description: string | null;
} {
  let text: string;
  try {
    text = readFileSync(join(dir, '.kiemi', 'project.json'), 'utf8');
  } catch {
    throw new DbError('FOLDER_INVALID', 'This folder is not a Kiemi project', {
      reason: 'noProject',
      dir,
    });
  }
  const p = parseFile(PATHS.project, normalizeText(text));
  if (!p.ok)
    throw new DbError('FOLDER_INVALID', 'The project file is damaged', { reason: p.reason, dir });
  const v = p.value as ReturnType<typeof ProjectFileSchema.parse>;
  return { id: v.id, name: v.name, description: v.description ?? null };
}

/**
 * Opens an existing project folder (Git clone, network share…). The folder wins
 * over what this machine had. One project id ↔ one folder [O-11].
 */
export function openProjectFolder(
  services: Services,
  dir: string,
): {
  projectId: string;
  result: SyncResult;
  missingSecrets: { environmentId: string; environment: string; names: string[] }[];
} {
  const folder = resolve(dir);
  const header = readProjectHeader(folder);
  const existing = services.projects.repo.find(header.id, true);
  let firstTime = true;
  if (existing) {
    const other = existing.folderPath ? resolve(existing.folderPath) : undefined;
    const sameFolder = other !== undefined && samePath(other, folder);
    if (!existing.deletedAt && other && !sameFolder && isProjectFolderOf(other, header.id))
      throw new DbError('PROJECT_ALREADY_OPEN', 'This project is open from another folder', {
        dir: other,
        name: existing.name,
      });
    if (existing.deletedAt) services.projects.repo.restore(existing.id);
    firstTime = !sameFolder;
    services.ctx.db
      .update(projects)
      .set({ folderPath: folder, ...(sameFolder ? {} : { folderState: {} }) })
      .where(eq(projects.id, header.id))
      .run();
  } else {
    services.projects.repo.create({
      id: header.id,
      name: header.name,
      description: header.description,
      folderPath: folder,
      folderState: {},
    });
  }
  const result = syncProjectFolder(services, header.id, firstTime ? { prefer: 'remote' } : {});
  return { projectId: header.id, result, missingSecrets: missingSecrets(services, header.id) };
}

/** Secrets expected by the project with no value on this machine, per environment [O-11]. */
export function missingSecrets(
  services: Services,
  projectId: string,
): { environmentId: string; environment: string; names: string[] }[] {
  return services.environments
    .list(projectId)
    .map((e) => ({
      environmentId: e.id,
      environment: e.name,
      names: services.environments.missingSecrets(e.id),
    }))
    .filter((x) => x.names.length > 0);
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string) =>
    process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p;
  return norm(resolve(a)) === norm(resolve(b));
}

function isProjectFolderOf(dir: string, id: string): boolean {
  try {
    return readProjectHeader(dir).id === id;
  } catch {
    return false;
  }
}

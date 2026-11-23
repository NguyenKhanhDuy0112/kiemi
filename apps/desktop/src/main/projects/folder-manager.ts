import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  attachProjectFolder,
  DbError,
  missingSecrets,
  openProjectFolder,
  type Services,
  type SyncOptions,
  type SyncResult,
  safeFileName,
  syncProjectFolder,
} from '@kiemi/db';

/** What the UI shows about a project's folder [T-01]. */
export interface FolderStatus {
  projectId: string;
  path: string | null;
  state: 'ok' | 'missing' | 'error';
  /** Files changed both in the app and on disk, waiting for the user's choice (M9-03). */
  conflicts: string[];
  /** Files on disk that could not be read (left untouched). */
  problems: { path: string; reason: string }[];
  missingSecrets: { environment: string; names: string[] }[];
  /** Error code when `state = error`. */
  error?: string;
}

export interface FolderManagerOptions {
  services: Services;
  /** Where new projects get their folder (`<Documents>/Kiemi`). */
  root: string;
  debounceMs?: number;
  /** Called when changes from disk were loaded (renderer should refetch). */
  onLoaded?: (projectIds: string[]) => void;
  log?: (message: string, err?: unknown) => void;
}

/**
 * Keeps every project's folder in step with the database (ADR 0018): moves v1.0
 * projects into folders, writes edits after each mutation (debounced) and on quit,
 * loads changes found on disk. Electron-free so it is unit-tested.
 */
export class ProjectFolderManager {
  readonly #o: FolderManagerOptions;
  readonly #status = new Map<string, FolderStatus>();
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: FolderManagerOptions) {
    this.#o = options;
  }

  /** A mutation happened: sync soon. */
  changed(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.syncAll();
    }, this.#o.debounceMs ?? 300);
  }

  /** Writes pending edits now (app quitting). */
  flush(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    this.syncAll();
  }

  stop(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** Syncs every project; projects without a folder get one under `root`. */
  syncAll(): FolderStatus[] {
    const loaded: string[] = [];
    const out: FolderStatus[] = [];
    for (const p of this.#o.services.projects.list()) {
      const status = this.syncProject(p.id);
      if (status.loaded) loaded.push(p.id);
      out.push(status.status);
    }
    if (loaded.length) this.#o.onLoaded?.(loaded);
    return out;
  }

  syncProject(
    projectId: string,
    options: SyncOptions = {},
  ): { status: FolderStatus; loaded: boolean } {
    const services = this.#o.services;
    let result: SyncResult | undefined;
    let error: string | undefined;
    let state: FolderStatus['state'] = 'ok';
    try {
      const row = services.projects.get(projectId);
      result = row.folderPath
        ? syncProjectFolder(services, projectId, options)
        : attachProjectFolder(services, projectId, this.defaultDirFor(row.name));
    } catch (err) {
      const code = err instanceof DbError ? err.code : 'unknown';
      const reason = err instanceof DbError ? err.details?.reason : undefined;
      state = reason === 'missing' ? 'missing' : 'error';
      error = reason ? `${code}:${String(reason)}` : code;
      if (state === 'error') this.#o.log?.(`Project folder sync failed (${projectId})`, err);
    }
    const row = services.projects.repo.find(projectId);
    const status: FolderStatus = {
      projectId,
      path: row?.folderPath ?? null,
      state,
      conflicts: result?.conflicts ?? this.#status.get(projectId)?.conflicts ?? [],
      problems: result?.problems ?? [],
      missingSecrets: row ? missingSecrets(services, projectId) : [],
      ...(error ? { error } : {}),
    };
    this.#status.set(projectId, status);
    return { status, loaded: (result?.loaded.length ?? 0) > 0 };
  }

  status(projectId: string): FolderStatus {
    return this.#status.get(projectId) ?? this.syncProject(projectId).status;
  }

  /** Opens an existing project folder (clone, network share) [T-01, O-11]. */
  open(dir: string): FolderStatus {
    const { projectId } = openProjectFolder(this.#o.services, dir);
    return this.syncProject(projectId).status;
  }

  /** `<root>/<name>`, or `<name> (2)`… when that folder is taken. */
  defaultDirFor(name: string): string {
    const stem = safeFileName(name);
    for (let n = 1; ; n++) {
      const dir = join(this.#o.root, n === 1 ? stem : `${stem} (${n})`);
      if (!existsSync(dir)) return dir;
      try {
        if (readdirSync(dir).length === 0) return dir;
      } catch {
        // Not readable: try the next name.
      }
    }
  }
}

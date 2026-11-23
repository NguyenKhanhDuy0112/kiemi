import { existsSync, type FSWatcher, readdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import {
  attachProjectFolder,
  DbError,
  missingSecrets,
  openProjectFolder,
  projectSignature,
  type Services,
  type SyncOptions,
  type SyncResult,
  safeFileName,
  syncProjectFolder,
} from '@kiemi/db';
import type { LockInfo, SoftLocks } from './locks';

/** What the UI shows about a project's folder [T-01]. */
export interface FolderStatus {
  projectId: string;
  path: string | null;
  state: 'ok' | 'missing' | 'error';
  /** Files changed both in the app and on disk, waiting for the user's choice (M9-03). */
  conflicts: string[];
  /** Files on disk that could not be read (left untouched). */
  problems: { path: string; reason: string }[];
  missingSecrets: { environmentId: string; environment: string; names: string[] }[];
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
  /** "Who is editing" hints in the project folders (absent in some tests). */
  locks?: SoftLocks;
  /** Safety-net scan interval for shares that do not report changes (default 3 s, ≤ 5 s SPEC). */
  pollMs?: number;
}

/** Pushed to the renderer: refetch data (`loaded`) or the folder status (`status`). */
export interface FolderEvent {
  kind: 'loaded' | 'status';
  projectId: string;
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
  #poll: ReturnType<typeof setInterval> | undefined;
  #watching = false;
  readonly #watchers = new Map<string, FSWatcher>();
  readonly #signatures = new Map<string, string>();
  readonly #listeners = new Set<(e: FolderEvent) => void>();

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
    if (this.#poll) clearInterval(this.#poll);
    this.#poll = undefined;
    this.#watching = false;
    for (const w of this.#watchers.values()) w.close();
    this.#watchers.clear();
  }

  /**
   * Notices teammates' changes: OS file events (fast) plus a periodic scan of
   * sizes/dates (network shares), so another machine's edit shows up in ≤ 5 s [T-01].
   */
  watch(): void {
    this.#watching = true;
    this.#rewatch();
    this.#poll ??= setInterval(() => {
      let dirty = false;
      for (const p of this.#o.services.projects.list()) {
        if (!p.folderPath) continue;
        const sig = projectSignature(p.folderPath);
        if (this.#signatures.get(p.id) !== sig) dirty = true;
      }
      if (dirty) this.changed();
    }, this.#o.pollMs ?? 3000);
  }

  /** One recursive watcher per project folder (re-created when folders change). */
  #rewatch(): void {
    if (!this.#watching) return;
    const wanted = new Map<string, string>();
    for (const p of this.#o.services.projects.list())
      if (p.folderPath && existsSync(p.folderPath)) wanted.set(p.folderPath, p.id);
    for (const [dir, w] of this.#watchers)
      if (!wanted.has(dir)) {
        w.close();
        this.#watchers.delete(dir);
      }
    for (const dir of wanted.keys()) {
      if (this.#watchers.has(dir)) continue;
      try {
        const w = watch(dir, { recursive: true }, (_event, file) => {
          const name = String(file ?? '').replaceAll('\\', '/');
          // Our temp files and machine-only folders are not edits.
          if (name.endsWith('.kiemi-tmp') || /(^|\/)\.kiemi\/(local|locks)(\/|$)/.test(name))
            return;
          this.changed();
        });
        w.on('error', () => {
          w.close();
          this.#watchers.delete(dir);
        });
        this.#watchers.set(dir, w);
      } catch {
        // Not watchable (some network shares): the periodic scan covers it.
      }
    }
  }

  /** Folder changes for the renderer (tRPC subscription). */
  async *events(signal?: AbortSignal): AsyncGenerator<FolderEvent> {
    const queue: FolderEvent[] = [];
    let wake: (() => void) | undefined;
    const listener = (e: FolderEvent) => {
      queue.push(e);
      wake?.();
    };
    this.#listeners.add(listener);
    const onAbort = () => wake?.();
    signal?.addEventListener('abort', onAbort);
    try {
      while (!signal?.aborted) {
        const next = queue.shift();
        if (next) {
          yield next;
          continue;
        }
        await new Promise<void>((r) => {
          wake = r;
        });
        wake = undefined;
      }
    } finally {
      this.#listeners.delete(listener);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  #emit(e: FolderEvent): void {
    for (const l of this.#listeners) l(e);
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
    if (this.#watching) this.#rewatch();
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
    const before = this.#status.get(projectId);
    this.#status.set(projectId, status);
    if (status.path) this.#signatures.set(projectId, projectSignature(status.path));
    const loaded = (result?.loaded.length ?? 0) > 0;
    if (loaded) this.#emit({ kind: 'loaded', projectId });
    if (JSON.stringify(before) !== JSON.stringify(status))
      this.#emit({ kind: 'status', projectId });
    return { status, loaded };
  }

  status(projectId: string): FolderStatus {
    return this.#status.get(projectId) ?? this.syncProject(projectId).status;
  }

  /** Opens an existing project folder (clone, network share) [T-01, O-11]. */
  open(dir: string): FolderStatus {
    const { projectId } = openProjectFolder(this.#o.services, dir);
    return this.syncProject(projectId).status;
  }

  /** Claims / refreshes "I am editing this test"; returns the other editor, if any. */
  touchLock(testId: string): LockInfo | null {
    const dir = this.#dirOfTest(testId);
    return (dir && this.#o.locks?.touch(dir, testId)) || null;
  }

  releaseLock(testId: string): void {
    const dir = this.#dirOfTest(testId);
    if (dir) this.#o.locks?.release(dir, testId);
  }

  #dirOfTest(testId: string): string | undefined {
    const t = this.#o.services.testCases.repo.find(testId);
    if (!t) return undefined;
    return this.#o.services.projects.repo.find(t.projectId)?.folderPath ?? undefined;
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

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Who is editing a test — a hint, never a hard block [T-01]. */
export interface LockInfo {
  user: string;
  host: string;
  /** Last heartbeat (epoch ms). */
  at: number;
}

/** A lock not refreshed for this long is ignored (app closed / crashed). */
export const LOCK_STALE_MS = 2 * 60_000;
/** Editors refresh their lock this often. */
export const LOCK_HEARTBEAT_MS = 30_000;

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const lockFile = (dir: string, testId: string) => join(dir, '.kiemi', 'locks', `${testId}.json`);

function read(file: string): LockInfo | undefined {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as Partial<LockInfo>;
    if (typeof v.user === 'string' && typeof v.host === 'string' && typeof v.at === 'number')
      return { user: v.user, host: v.host, at: v.at };
  } catch {
    // Missing or half-written.
  }
  return undefined;
}

const same = (a: Pick<LockInfo, 'user' | 'host'>, b: Pick<LockInfo, 'user' | 'host'>) =>
  a.user === b.user && a.host.toLowerCase() === b.host.toLowerCase();

/**
 * Soft locks in `.kiemi/locks/<testId>.json` (shared on a network folder, ignored
 * by Git). Opening / heartbeating a test claims it and returns whoever else is
 * editing it right now.
 */
export class SoftLocks {
  readonly #me: { user: string; host: string };
  readonly #now: () => number;

  constructor(me: { user: string; host: string }, now: () => number = Date.now) {
    this.#me = me;
    this.#now = now;
  }

  /** Claims (or refreshes) the lock. Returns the other editor if one holds a fresh lock. */
  touch(dir: string, testId: string): LockInfo | undefined {
    if (!SAFE_ID.test(testId)) return undefined;
    const file = lockFile(dir, testId);
    const cur = read(file);
    const now = this.#now();
    if (cur && !same(cur, this.#me) && now - cur.at < LOCK_STALE_MS) return cur;
    try {
      mkdirSync(join(dir, '.kiemi', 'locks'), { recursive: true });
      const tmp = `${file}.kiemi-tmp`;
      writeFileSync(tmp, JSON.stringify({ ...this.#me, at: now }));
      renameSync(tmp, file);
    } catch {
      // Read-only share: locks are only a hint.
    }
    return undefined;
  }

  /** Drops our lock (editor closed). Never removes someone else's. */
  release(dir: string, testId: string): void {
    if (!SAFE_ID.test(testId)) return;
    const file = lockFile(dir, testId);
    const cur = read(file);
    if (!cur || !same(cur, this.#me)) return;
    try {
      unlinkSync(file);
    } catch {
      // Already gone.
    }
  }
}

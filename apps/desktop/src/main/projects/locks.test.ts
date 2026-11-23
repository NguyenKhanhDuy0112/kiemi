import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LOCK_STALE_MS, SoftLocks } from './locks';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('soft locks [T-01]', () => {
  it('tells B that A is editing; stale or released locks are ignored', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-lock-'));
    dirs.push(dir);
    let now = 1_000_000;
    const a = new SoftLocks({ user: 'an', host: 'PC-A' }, () => now);
    const b = new SoftLocks({ user: 'binh', host: 'PC-B' }, () => now);
    expect(a.touch(dir, 't1')).toBeUndefined();
    expect(existsSync(join(dir, '.kiemi', 'locks', 't1.json'))).toBe(true);
    expect(b.touch(dir, 't1')).toEqual({ user: 'an', host: 'PC-A', at: now });
    // A refreshes its own lock without being warned about itself.
    expect(a.touch(dir, 't1')).toBeUndefined();
    // B cannot drop A's lock.
    b.release(dir, 't1');
    expect(b.touch(dir, 't1')).toMatchObject({ user: 'an' });
    // A's app closed without releasing: after a while B takes over.
    now += LOCK_STALE_MS + 1;
    expect(b.touch(dir, 't1')).toBeUndefined();
    expect(a.touch(dir, 't1')).toMatchObject({ user: 'binh' });
    b.release(dir, 't1');
    expect(a.touch(dir, 't1')).toBeUndefined();
  });

  it('ignores ids that are not plain ids (no path tricks)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-lock-'));
    dirs.push(dir);
    const a = new SoftLocks({ user: 'an', host: 'PC-A' });
    expect(a.touch(dir, '../../evil')).toBeUndefined();
    expect(existsSync(join(dir, '.kiemi', 'locks'))).toBe(false);
  });
});

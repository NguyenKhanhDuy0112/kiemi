import { describe, expect, it } from 'vitest';
import { folderNotices } from './folder-notices';

const tx = (key: string, vars?: Record<string, unknown>) =>
  `${key}${vars ? JSON.stringify(vars) : ''}`;
const ok = { path: '/p', state: 'ok' as const, conflicts: [], problems: [], missingSecrets: [] };

describe('project folder notices [T-01, O-11]', () => {
  it('says nothing when the folder is in step', () => {
    expect(folderNotices(ok, tx)).toEqual([]);
  });

  it('warns about a missing folder, conflicts and broken files; lists missing secrets', () => {
    const n = folderNotices(
      {
        ...ok,
        state: 'missing',
        conflicts: ['tests/a.kiemi.json'],
        problems: [{ path: 'tests/b.kiemi.json', reason: 'badJson' }],
        missingSecrets: [
          { environment: 'UAT', names: ['pass', 'key'] },
          { environment: 'DEV', names: ['pass'] },
        ],
      },
      tx,
    );
    expect(n.map((x) => x.level)).toEqual(['warning', 'warning', 'warning', 'info']);
    expect(n[0]?.text).toContain('ui.projectFolder.missing');
    expect(n[3]?.text).toBe('ui.projectFolder.missingSecrets{"count":3,"envs":"UAT, DEV"}');
    // Stable keys: the same situation is shown once.
    expect(folderNotices({ ...ok, state: 'missing' }, tx)[0]?.key).toBe(n[0]?.key);
  });
});

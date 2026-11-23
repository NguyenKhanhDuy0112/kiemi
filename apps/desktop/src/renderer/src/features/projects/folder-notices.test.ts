import { describe, expect, it } from 'vitest';
import { describeFolderPath, folderNotices } from './folder-notices';

const tx = (key: string, vars?: Record<string, unknown>) =>
  `${key}${vars ? JSON.stringify(vars) : ''}`;
const ok = { path: '/p', state: 'ok' as const, problems: [] };

describe('project folder notices [T-01]', () => {
  it('says nothing when the folder is in step', () => {
    expect(folderNotices(ok, tx)).toEqual([]);
  });

  it('warns about a missing folder and broken files, with stable keys', () => {
    const n = folderNotices(
      { ...ok, state: 'missing', problems: [{ path: 'tests/b.kiemi.json', reason: 'badJson' }] },
      tx,
    );
    expect(n.map((x) => x.level)).toEqual(['warning', 'warning']);
    expect(n[0]?.text).toBe('ui.projectFolder.missing{"path":"/p"}');
    expect(folderNotices({ ...ok, state: 'missing' }, tx)[0]?.key).toBe(n[0]?.key);
  });

  it('names conflicting files in plain words', () => {
    expect(describeFolderPath('tests/Nghỉ phép/Duyệt/Tạo đơn.kiemi.json', tx)).toBe(
      'ui.projectFolder.kind.test{"name":"Nghỉ phép / Duyệt / Tạo đơn"}',
    );
    expect(describeFolderPath('.kiemi/environments.json', tx)).toBe(
      'ui.projectFolder.kind.environments',
    );
    expect(describeFolderPath('.kiemi/suites/Hồi quy.json', tx)).toBe(
      'ui.projectFolder.kind.suite{"name":"Hồi quy"}',
    );
  });
});

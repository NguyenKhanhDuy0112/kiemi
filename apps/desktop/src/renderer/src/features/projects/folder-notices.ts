/** Pure helpers for the project folder status (no IPC: unit-tested). */
export type Tx = (key: string, vars?: Record<string, unknown>) => string;

interface StatusLike {
  path: string | null;
  state: 'ok' | 'missing' | 'error';
  problems: unknown[];
}

/**
 * Toasts for a project folder status [T-01]. Conflicts and missing secrets have
 * their own dialogs (`folder-dialogs.tsx`).
 */
export function folderNotices(
  s: StatusLike,
  tx: Tx,
): { key: string; level: 'warning' | 'info'; text: string }[] {
  const out: { key: string; level: 'warning' | 'info'; text: string }[] = [];
  if (s.state === 'missing')
    out.push({
      key: `missing:${s.path}`,
      level: 'warning',
      text: tx('ui.projectFolder.missing', { path: s.path ?? '' }),
    });
  if (s.problems.length)
    out.push({
      key: `problems:${s.problems.length}`,
      level: 'warning',
      text: tx('ui.projectFolder.problems', { count: s.problems.length }),
    });
  return out;
}

const stem = (file: string, ext: string) => {
  const base = file.slice(file.lastIndexOf('/') + 1);
  return base.endsWith(ext) ? base.slice(0, -ext.length) : base;
};

/** "tests/Nghỉ phép/Tạo đơn.kiemi.json" → "Test “Nghỉ phép / Tạo đơn”" — no file jargon (U-15). */
export function describeFolderPath(path: string, tx: Tx): string {
  const k = (kind: string, name?: string) =>
    tx(`ui.projectFolder.kind.${kind}`, name === undefined ? undefined : { name });
  if (path === '.kiemi/project.json') return k('project');
  if (path === '.kiemi/folders.json') return k('folders');
  if (path === '.kiemi/environments.json') return k('environments');
  if (path === '.kiemi/elements.json') return k('elements');
  if (path.startsWith('.kiemi/shared-steps/')) return k('sharedStep', stem(path, '.json'));
  if (path.startsWith('.kiemi/datasets/')) return k('dataset', stem(path, '.json'));
  if (path.startsWith('.kiemi/suites/')) return k('suite', stem(path, '.json'));
  if (path.startsWith('tests/')) {
    const parts = path.slice('tests/'.length).split('/');
    const last = stem(parts.pop() ?? '', '.kiemi.json');
    return k('test', [...parts, last].join(' / '));
  }
  return path;
}

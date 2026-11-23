/** Pure helpers for the project folder status (no IPC: unit-tested). */
export type Tx = (key: string, vars?: Record<string, unknown>) => string;

interface StatusLike {
  path: string | null;
  state: 'ok' | 'missing' | 'error';
  conflicts: string[];
  problems: unknown[];
  missingSecrets: { environment: string; names: string[] }[];
}

/** Plain-language notices for a project folder status [T-01, O-11]. Pure, for tests. */
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
  if (s.conflicts.length)
    out.push({
      key: `conflicts:${s.conflicts.join('|')}`,
      level: 'warning',
      text: tx('ui.projectFolder.conflicts', { count: s.conflicts.length }),
    });
  if (s.problems.length)
    out.push({
      key: `problems:${s.problems.length}`,
      level: 'warning',
      text: tx('ui.projectFolder.problems', { count: s.problems.length }),
    });
  const count = s.missingSecrets.reduce((n, m) => n + m.names.length, 0);
  if (count)
    out.push({
      key: `secrets:${s.missingSecrets.map((m) => `${m.environment}=${m.names.join(',')}`).join(';')}`,
      level: 'info',
      text: tx('ui.projectFolder.missingSecrets', {
        count,
        envs: s.missingSecrets.map((m) => m.environment).join(', '),
      }),
    });
  return out;
}

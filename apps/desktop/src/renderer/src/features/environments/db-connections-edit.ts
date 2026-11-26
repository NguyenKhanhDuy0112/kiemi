import type { DbConnection } from '@kiemi/schema';

/** Is the connection complete enough to save? Key of the missing piece, else `null`. */
export function connectionProblem(c: DbConnection, taken: string[]): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name)) return 'name';
  if (taken.includes(c.name)) return 'duplicate';
  if (!c.database.trim()) return c.kind === 'sqlite' ? 'file' : 'database';
  if (c.kind !== 'sqlite' && !c.host?.trim()) return 'host';
  return null;
}

/** Cleans a draft before saving: SQLite has no host/user, empty strings are dropped. */
export function tidyConnection(c: DbConnection): DbConnection {
  const out: DbConnection = {
    name: c.name.trim(),
    kind: c.kind,
    database: c.database.trim(),
    ssl: c.ssl,
  };
  if (c.kind !== 'sqlite') {
    if (c.host?.trim()) out.host = c.host.trim();
    if (c.port) out.port = c.port;
    if (c.username?.trim()) out.username = c.username.trim();
    if (c.passwordSecret) out.passwordSecret = c.passwordSecret;
  }
  return out;
}

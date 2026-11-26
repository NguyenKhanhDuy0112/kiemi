import { bindPlaceholders, type DbQuery, type DbResult } from '@kiemi/engine';

/** PostgreSQL through `pg`. A read-only query runs in a READ ONLY transaction that is rolled back. */
export async function queryPostgres(q: DbQuery): Promise<DbResult> {
  const { Client } = await import('pg');
  const { connection: c } = q;
  const client = new Client({
    host: c.host ?? 'localhost',
    port: c.port ?? 5432,
    database: c.database,
    ...(c.username ? { user: c.username } : {}),
    ...(c.password !== undefined ? { password: c.password } : {}),
    ...(c.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    connectionTimeoutMillis: Math.max(1, q.timeoutMs),
    statement_timeout: Math.max(1, q.timeoutMs),
  });
  await client.connect();
  try {
    const { sql } = bindPlaceholders(q.sql, 'postgres');
    if (q.readOnly) await client.query('BEGIN READ ONLY');
    try {
      const res = await client.query({ text: sql, values: q.args });
      return { rows: res.rows as Record<string, unknown>[], affected: res.rowCount ?? undefined };
    } finally {
      if (q.readOnly) await client.query('ROLLBACK').catch(() => undefined);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

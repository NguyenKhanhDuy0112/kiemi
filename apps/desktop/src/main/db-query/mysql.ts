import type { DbQuery, DbResult } from '@kiemi/engine';

/** MySQL / MariaDB through `mysql2`. A read-only query runs in a READ ONLY transaction. */
export async function queryMysql(q: DbQuery): Promise<DbResult> {
  const mysql = await import('mysql2/promise');
  const { connection: c } = q;
  const conn = await mysql.createConnection({
    host: c.host ?? 'localhost',
    port: c.port ?? 3306,
    database: c.database,
    ...(c.username ? { user: c.username } : {}),
    ...(c.password !== undefined ? { password: c.password } : {}),
    ...(c.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    connectTimeout: Math.max(1, q.timeoutMs),
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  try {
    if (q.readOnly) {
      await conn.query('SET SESSION TRANSACTION READ ONLY');
      await conn.query('START TRANSACTION');
    }
    try {
      const [res] = await conn.execute({
        sql: q.sql,
        values: q.args,
        timeout: Math.max(1, q.timeoutMs),
      });
      if (Array.isArray(res)) return { rows: res as unknown as Record<string, unknown>[] };
      return { rows: [], affected: (res as { affectedRows?: number }).affectedRows };
    } finally {
      if (q.readOnly) await conn.query('ROLLBACK').catch(() => undefined);
    }
  } finally {
    await conn.end().catch(() => undefined);
  }
}

import type { DbClient, DbQuery, DbResult } from '@kiemi/engine';

/** Raised for problems the tester can fix, e.g. a SQLite file that is not there. */
export type DbDriver = (q: DbQuery) => Promise<DbResult>;

/** Each driver loads only when its kind is first used, so the app opens fast [ADR 0023]. */
const DRIVERS: Record<string, () => Promise<DbDriver>> = {
  sqlite: async () => (await import('./sqlite')).querySqlite,
  postgres: async () => (await import('./postgres')).queryPostgres,
  mysql: async () => (await import('./mysql')).queryMysql,
  mssql: async () => (await import('./mssql')).queryMssql,
};

/**
 * Database access for tests: one short connection per query, closed right after.
 * `drivers` lets tests replace a driver.
 */
export function createDbClient(
  drivers: Record<string, () => Promise<DbDriver>> = DRIVERS,
): DbClient {
  return {
    async query(q) {
      const load = drivers[q.connection.kind];
      if (!load) throw new Error(`Unsupported database kind: ${q.connection.kind}`);
      const result = await (await load())(q);
      if (result.rows.length > q.maxRows)
        return { ...result, rows: result.rows.slice(0, q.maxRows + 1) };
      return result;
    },
  };
}

import type { DbQuery, DbResult } from '@kiemi/engine';
import Database from 'better-sqlite3';

/** SQLite file (`database` = path). Read-only queries open the file read-only. */
export async function querySqlite(q: DbQuery): Promise<DbResult> {
  const db = new Database(q.connection.database, {
    readonly: q.readOnly,
    fileMustExist: true,
    timeout: Math.max(1, q.timeoutMs),
  });
  try {
    const stmt = db.prepare(q.sql);
    if (stmt.reader) {
      const rows: Record<string, unknown>[] = [];
      for (const row of stmt.iterate(...q.args) as Iterable<Record<string, unknown>>) {
        rows.push(row);
        if (rows.length > q.maxRows) break;
      }
      return { rows };
    }
    return { rows: [], affected: stmt.run(...q.args).changes };
  } finally {
    db.close();
  }
}

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { LeaveRequest } from './store';

/** A fresh file path in the OS temp folder for a demo database. */
export function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'kiemi-demo-db-')), 'demo.db');
}

/**
 * Real database behind the leave requests [X-05, L-03 #6]: after every change the table holds
 * exactly what the site shows, so a test can check the saved record with a `queryDb` step.
 */
export class DemoDb {
  readonly #db: Database.Database;

  constructor(readonly path: string) {
    this.#db = new Database(path);
    this.#db.pragma('journal_mode = DELETE');
    this.#db.exec(`CREATE TABLE IF NOT EXISTS leave_requests (
      code TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      type TEXT NOT NULL,
      from_date TEXT NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT NOT NULL,
      urgent INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
  }

  /** Replaces the table content with `requests` (tiny data: simpler than diffing). */
  sync(requests: readonly LeaveRequest[]): void {
    const insert = this.#db.prepare(
      'INSERT INTO leave_requests (code, owner, type, from_date, days, reason, urgent, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    this.#db.transaction(() => {
      this.#db.exec('DELETE FROM leave_requests');
      for (const r of requests)
        insert.run(
          r.code,
          r.owner,
          r.type,
          r.fromDate,
          r.days,
          r.reason,
          r.urgent ? 1 : 0,
          r.status,
          r.createdAt,
        );
    })();
  }

  close(): void {
    this.#db.close();
  }
}

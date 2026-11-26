import type { DbConnection } from '@kiemi/schema';

/** A connection with its password read from the environment's secrets (in memory only). */
export interface ResolvedDbConnection extends DbConnection {
  password?: string | undefined;
}

export interface DbQuery {
  connection: ResolvedDbConnection;
  /** One statement with `?` placeholders; the driver adapter rewrites them for its database. */
  sql: string;
  args: (string | number | boolean | null)[];
  /** Ask the database itself to refuse writes (read-only transaction) where it can. */
  readOnly: boolean;
  maxRows: number;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}

export interface DbResult {
  rows: Record<string, unknown>[];
  /** Rows changed by a write statement. */
  affected?: number | undefined;
}

/**
 * What the `queryDb` step needs from a database driver [X-05, ADR 0023]. The engine knows no
 * driver: the host (desktop app, CLI, tests) passes an implementation in `RunOptions.db`.
 */
export interface DbClient {
  query(q: DbQuery): Promise<DbResult>;
}

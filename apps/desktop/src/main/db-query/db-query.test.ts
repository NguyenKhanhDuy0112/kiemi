// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DbQuery } from '@kiemi/engine';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const pgQueries: { text?: string; values?: unknown[] }[] = [];

vi.mock('pg', () => ({
  Client: class {
    constructor(public opts: Record<string, unknown>) {
      calls.push(`pg:new:${JSON.stringify(opts)}`);
    }
    async connect() {
      calls.push('pg:connect');
    }
    async query(q: string | { text: string; values: unknown[] }) {
      if (typeof q === 'string') calls.push(`pg:${q}`);
      else {
        pgQueries.push(q);
        calls.push('pg:query');
      }
      return { rows: [{ status: 'approved' }], rowCount: 1 };
    }
    async end() {
      calls.push('pg:end');
    }
  },
}));

vi.mock('mysql2/promise', () => ({
  createConnection: async (opts: Record<string, unknown>) => {
    calls.push(`my:new:${JSON.stringify(opts)}`);
    return {
      query: async (sql: string) => calls.push(`my:${sql}`),
      execute: async (o: { sql: string; values: unknown[] }) => {
        calls.push(`my:execute:${o.sql}:${JSON.stringify(o.values)}`);
        return [[{ status: 'approved' }], []];
      },
      end: async () => calls.push('my:end'),
    };
  },
}));

vi.mock('tedious', () => {
  class Request {
    params: { name: string; value: unknown }[] = [];
    constructor(
      public sql: string,
      public done: (err: Error | null, count: number, rows: unknown[]) => void,
    ) {}
    addParameter(name: string, _type: unknown, value: unknown) {
      this.params.push({ name, value });
    }
  }
  class Connection {
    handlers: Record<string, (e?: Error) => void> = {};
    constructor(public cfg: Record<string, unknown>) {
      calls.push(`ms:new:${JSON.stringify(cfg)}`);
    }
    on(ev: string, fn: (e?: Error) => void) {
      this.handlers[ev] = fn;
    }
    connect() {
      this.handlers.connect?.();
    }
    execSql(r: Request) {
      calls.push(`ms:${r.sql}:${JSON.stringify(r.params)}`);
      r.done(null, 1, [[{ metadata: { colName: 'status' }, value: 'approved' }]]);
    }
    close() {
      calls.push('ms:close');
    }
  }
  return {
    Connection,
    Request,
    TYPES: { BigInt: 'bigint', Float: 'float', Bit: 'bit', NVarChar: 'nvarchar' },
  };
});

import { createDbClient } from './index';

const base = (more: Partial<DbQuery> & { kind: DbQuery['connection']['kind'] }): DbQuery => {
  const { kind, ...rest } = more;
  return {
    connection: {
      name: 'qa',
      kind,
      host: 'db.local',
      database: 'don',
      username: 'tester',
      password: 'pw',
      ssl: false,
    },
    sql: 'SELECT status FROM don WHERE id = ? AND owner = ?',
    args: [7, 'an'],
    readOnly: true,
    maxRows: 100,
    timeoutMs: 5000,
    ...rest,
  };
};

beforeEach(() => {
  calls.length = 0;
  pgQueries.length = 0;
});

describe('database drivers [X-05]', () => {
  it('SQLite: reads with values, refuses writes in read-only mode, writes when allowed', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'kiemi-sqlite-')), 'don.db');
    const seed = new Database(file);
    seed.exec("CREATE TABLE don (id INTEGER, status TEXT); INSERT INTO don VALUES (7, 'approved')");
    seed.close();
    const db = createDbClient();
    const conn = { ...base({ kind: 'sqlite' }).connection, database: file };
    const read = await db.query({
      ...base({ kind: 'sqlite' }),
      connection: conn,
      sql: 'SELECT status FROM don WHERE id = ?',
      args: [7],
    });
    expect(read.rows).toEqual([{ status: 'approved' }]);
    await expect(
      db.query({
        ...base({ kind: 'sqlite' }),
        connection: conn,
        sql: "UPDATE don SET status = 'x'",
        args: [],
      }),
    ).rejects.toThrow(/readonly/i);
    const write = await db.query({
      ...base({ kind: 'sqlite' }),
      connection: conn,
      sql: "UPDATE don SET status = 'draft' WHERE id = ?",
      args: [7],
      readOnly: false,
    });
    expect(write.affected).toBe(1);
    await expect(
      db.query({
        ...base({ kind: 'sqlite' }),
        connection: { ...conn, database: `${file}.missing` },
      }),
    ).rejects.toThrow();
  });

  it('Postgres: $n placeholders, READ ONLY transaction rolled back, connection closed', async () => {
    const r = await createDbClient().query(base({ kind: 'postgres' }));
    expect(r.rows).toEqual([{ status: 'approved' }]);
    expect(pgQueries[0]).toEqual({
      text: 'SELECT status FROM don WHERE id = $1 AND owner = $2',
      values: [7, 'an'],
    });
    const order = calls.filter((c) => !c.startsWith('pg:new'));
    expect(order).toEqual([
      'pg:connect',
      'pg:BEGIN READ ONLY',
      'pg:query',
      'pg:ROLLBACK',
      'pg:end',
    ]);
    expect(calls[0]).toContain('"password":"pw"');
  });

  it('Postgres: a write runs without the read-only transaction', async () => {
    await createDbClient().query(base({ kind: 'postgres', readOnly: false }));
    expect(calls.filter((c) => c.startsWith('pg:') && !c.startsWith('pg:new'))).toEqual([
      'pg:connect',
      'pg:query',
      'pg:end',
    ]);
  });

  it('MySQL: keeps ?, read-only transaction, closes', async () => {
    const r = await createDbClient().query(base({ kind: 'mysql' }));
    expect(r.rows).toEqual([{ status: 'approved' }]);
    expect(calls.filter((c) => !c.startsWith('my:new'))).toEqual([
      'my:SET SESSION TRANSACTION READ ONLY',
      'my:START TRANSACTION',
      'my:execute:SELECT status FROM don WHERE id = ? AND owner = ?:[7,"an"]',
      'my:ROLLBACK',
      'my:end',
    ]);
  });

  it('SQL Server: @p1… parameters and rows by column name', async () => {
    const r = await createDbClient().query(base({ kind: 'mssql' }));
    expect(r.rows).toEqual([{ status: 'approved' }]);
    expect(calls).toContain(
      'ms:SELECT status FROM don WHERE id = @p1 AND owner = @p2:[{"name":"p1","value":7},{"name":"p2","value":"an"}]',
    );
    expect(calls.at(-1)).toBe('ms:close');
  });

  it('cuts a huge result and rejects an unknown kind', async () => {
    const fake = async () => ({ rows: Array.from({ length: 50 }, (_, i) => ({ i })) });
    const db = createDbClient({ postgres: async () => fake });
    expect((await db.query({ ...base({ kind: 'postgres' }), maxRows: 10 })).rows).toHaveLength(11);
    await expect(db.query(base({ kind: 'mysql' }))).rejects.toThrow(/Unsupported/);
  });
});

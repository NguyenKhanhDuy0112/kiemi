import { z } from 'zod';
import { checkSql } from '../db/sql-safety';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { text } from './_common';

const MAX_ROWS = 10_000;
const argValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** Cells as plain values a variable can hold (dates → ISO text, bigint/Buffer → text). */
export function plainCell(v: unknown): unknown {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return Buffer.from(v).toString('hex');
  return v;
}

/**
 * Look into a database [X-05, ADR 0023]: run one statement on a connection of the
 * environment and keep the rows in a list variable. Read-only unless the step says
 * `write` and confirms it; a write is also stopped on a protected environment [W-10].
 */
export const queryDbAction = defineAction({
  type: 'queryDb',
  params: z.object({
    /** Name of a connection of the environment. */
    connection: text,
    /** One statement; use `?` for values and put them in `args`. */
    sql: text,
    args: z.array(argValue).default([]),
    /** The list of rows is saved here (`{{rows[0].status}}`, `COUNT(rows)`). */
    into: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      .optional(),
    /** The step changes data: needs `confirmWrite` too. */
    write: z.boolean().default(false),
    confirmWrite: z.boolean().default(false),
    /** Fail unless exactly this many rows come back. */
    expectRows: z.coerce.number().int().min(0).optional(),
    maxRows: z.coerce.number().int().min(1).max(MAX_ROWS).default(MAX_ROWS),
  }),
  writes: (p) => p.write === true,
  ui: { label: 'actions.queryDb', icon: 'database', group: 'data' },
  async execute(p, ctx) {
    const db = ctx.run.db;
    if (!db) throw new EngineError('DB_NOT_AVAILABLE', 'Database access is not available here');
    const connections = ctx.run.env?.dbConnections ?? [];
    const conn = connections.find((c) => c.name === p.connection);
    if (!conn)
      throw new EngineError('DB_CONNECTION_UNKNOWN', `No database connection "${p.connection}"`, {
        name: p.connection,
        available: connections.map((c) => c.name).join(', '),
      });

    const check = checkSql(p.sql);
    if (check.kind === 'empty')
      throw new EngineError('INVALID_PARAMS', 'The SQL statement is empty', { field: 'sql' });
    if (check.multiple)
      throw new EngineError('DB_WRITE_BLOCKED', 'Only one statement per step', {
        reason: 'multiple',
      });
    if (p.write) {
      if (!p.confirmWrite)
        throw new EngineError('DB_WRITE_BLOCKED', 'A writing step must be confirmed', {
          reason: 'confirm',
        });
      if (ctx.run.env?.protected)
        throw new EngineError('PROTECTED_ENVIRONMENT', 'Protected environment', {
          environment: ctx.run.env.name,
        });
    } else if (check.kind !== 'read') {
      throw new EngineError('DB_WRITE_BLOCKED', 'This statement may change data', {
        reason: 'readOnly',
      });
    }

    const secret = conn.passwordSecret;
    const password = secret ? ctx.run.secrets[secret] : undefined;
    if (secret && password === undefined)
      throw new EngineError('DB_SECRET_MISSING', `Secret "${secret}" has no value`, { secret });

    let result: Awaited<ReturnType<typeof db.query>>;
    try {
      result = await db.query({
        connection: { ...conn, password },
        sql: p.sql,
        args: p.args,
        readOnly: !p.write,
        maxRows: p.maxRows,
        timeoutMs: ctx.remainingMs(),
        signal: ctx.signal,
      });
    } catch (err) {
      if (err instanceof EngineError) throw err;
      let reason = err instanceof Error ? err.message : String(err);
      for (const s of ctx.vars.secretValues()) if (s) reason = reason.split(s).join('•••');
      throw new EngineError('DB_QUERY_FAILED', `Database error: ${reason}`, {
        connection: conn.name,
        reason: reason.slice(0, 300),
      });
    }

    const rows = result.rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plainCell(v)])),
    );
    if (rows.length > p.maxRows)
      throw new EngineError('DB_QUERY_FAILED', `More than ${p.maxRows} rows`, {
        connection: conn.name,
        reason: `> ${p.maxRows}`,
      });
    if (p.into) ctx.vars.set(p.into, rows);
    ctx.log(
      p.write
        ? `${conn.name}: ${result.affected ?? 0} dòng bị thay đổi`
        : `${conn.name}: ${rows.length} dòng`,
    );
    if (p.expectRows !== undefined && rows.length !== p.expectRows)
      throw new EngineError(
        'ASSERTION_FAILED',
        `Expected ${p.expectRows} rows but got ${rows.length}`,
        {
          check: 'rows',
          op: 'equals',
          expected: String(p.expectRows),
          actual: String(rows.length),
        },
      );
  },
});

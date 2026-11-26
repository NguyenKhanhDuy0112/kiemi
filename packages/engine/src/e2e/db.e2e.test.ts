import type { DbConnection } from '@kiemi/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2E, fakeDb, startE2E, step, summary } from './helpers';

let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

const qa: DbConnection = {
  name: 'qa',
  kind: 'postgres',
  host: 'db.local',
  port: 5432,
  database: 'don',
  username: 'tester',
  passwordSecret: 'DB_PW',
  ssl: false,
};
const withDb = (more: Record<string, unknown> = {}) => ({
  env: { dbConnections: [qa], secretNames: ['DB_PW'] },
  request: { secrets: { DB_PW: 'p@ss-secret' } },
  ...more,
});

describe('queryDb [X-05]', () => {
  it('reads rows into a list variable, with values bound and the password from a secret', async () => {
    const db = fakeDb([{ id: 7, status: 'approved', at: new Date('2026-11-26T01:00:00Z') }]);
    const r = await e.run(
      [
        step('queryDb', {
          connection: 'qa',
          sql: 'SELECT id, status, at FROM don WHERE id = ?',
          args: [7],
          into: 'rows',
          expectRows: 1,
        }),
        step('assertNumber', { actual: '{{rows[0].id}}', op: 'eq', value: 7 }),
        step('assertNumber', { actual: '{{rows.length}}', op: 'eq', value: 1 }),
      ],
      { db, ...withDb() },
    );
    expect(summary(r)).toEqual(['1 passed', '2 passed', '3 passed']);
    expect(db.queries[0]).toMatchObject({
      sql: 'SELECT id, status, at FROM don WHERE id = ?',
      args: [7],
      readOnly: true,
      connection: { name: 'qa', password: 'p@ss-secret' },
    });
  });

  it('refuses a statement that may change data unless the step is a confirmed write', async () => {
    const db = fakeDb();
    const r = await e.run(
      [
        step('queryDb', { connection: 'qa', sql: "UPDATE don SET status = 'x'" }),
        step('queryDb', { connection: 'qa', sql: 'SELECT 1; SELECT 2' }),
        step('queryDb', { connection: 'qa', sql: 'DELETE FROM don', write: true }),
      ].map((s) => ({ ...s, mode: 'soft' as const })),
      { db, ...withDb() },
    );
    expect(r.steps.map((s) => s.status)).toEqual(['failed', 'failed', 'failed']);
    expect(r.steps.map((s) => s.error?.details?.reason)).toEqual([
      'readOnly',
      'multiple',
      'confirm',
    ]);
    expect(db.queries).toEqual([]);
  });

  it('lets a confirmed write through, except on a protected environment [W-10]', async () => {
    const db = fakeDb();
    const write = step('queryDb', {
      connection: 'qa',
      sql: "UPDATE don SET status = 'draft' WHERE id = ?",
      args: [1],
      write: true,
      confirmWrite: true,
    });
    const ok = await e.run([write], { db, ...withDb() });
    expect(summary(ok)).toEqual(['1 passed']);
    expect(db.queries[0]).toMatchObject({ readOnly: false });

    const blocked = fakeDb();
    const prod = await e.run([write], {
      db: blocked,
      ...withDb({ env: { dbConnections: [qa], secretNames: ['DB_PW'], protected: true } }),
    });
    expect(prod.status).not.toBe('passed');
    expect(prod.error?.code).toBe('PROTECTED_ENVIRONMENT');
    expect(blocked.queries).toEqual([]);
  });

  it('names the problem for an unknown connection, a missing secret, a failing query and no driver', async () => {
    const failing = {
      async query() {
        throw new Error('connect ECONNREFUSED p@ss-secret');
      },
    };
    const soft = (s: ReturnType<typeof step>) => ({ ...s, mode: 'soft' as const });
    const r = await e.run(
      [
        soft(step('queryDb', { connection: 'nope', sql: 'SELECT 1' })),
        soft(step('queryDb', { connection: 'qa', sql: 'SELECT 1' })),
      ],
      { db: failing, env: { dbConnections: [qa], secretNames: ['DB_PW'] } },
    );
    expect(r.steps.map((s) => s.error?.code)).toEqual([
      'DB_CONNECTION_UNKNOWN',
      'DB_SECRET_MISSING',
    ]);

    const boom = await e.run([soft(step('queryDb', { connection: 'qa', sql: 'SELECT 1' }))], {
      db: failing,
      ...withDb(),
    });
    expect(boom.steps[0]?.error?.code).toBe('DB_QUERY_FAILED');
    expect(JSON.stringify(boom.steps[0]?.error)).not.toContain('p@ss-secret');

    const none = await e.run(
      [soft(step('queryDb', { connection: 'qa', sql: 'SELECT 1' }))],
      withDb(),
    );
    expect(none.steps[0]?.error?.code).toBe('DB_NOT_AVAILABLE');
  });

  it('fails the step when the number of rows is not the expected one', async () => {
    const r = await e.run(
      [step('queryDb', { connection: 'qa', sql: 'SELECT 1', expectRows: 2 })].map((s) => ({
        ...s,
        mode: 'soft' as const,
      })),
      { db: fakeDb([{ a: 1 }]), ...withDb() },
    );
    expect(r.steps[0]?.error).toMatchObject({
      code: 'ASSERTION_FAILED',
      details: { expected: '2', actual: '1' },
    });
  });
});

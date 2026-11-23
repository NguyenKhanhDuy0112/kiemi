import { describe, expect, it } from 'vitest';
import { DatasetSchema, DatasetSourceSchema } from './dataset';
import { EnvSchema } from './env';
import { RunResultSchema } from './run-result';
import { StepSchema } from './step';
import { collectRefs, TestCaseSchema } from './test-case';

const ID = '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f00';

describe('StepSchema', () => {
  it('applies defaults (session "default", enabled, hard mode, empty params)', () => {
    expect(StepSchema.parse({ id: 's1', action: 'reload' })).toEqual({
      id: 's1',
      action: 'reload',
      params: {},
      session: 'default',
      enabled: true,
      mode: 'hard',
    });
  });

  it('accepts a per-step timeout [D-07] and rejects bad ones', () => {
    expect(StepSchema.parse({ id: 's1', action: 'click', timeoutMs: 5000 }).timeoutMs).toBe(5000);
    expect(StepSchema.safeParse({ id: 's1', action: 'click', timeoutMs: 0 }).success).toBe(false);
    expect(StepSchema.safeParse({ id: 's1', action: 'click', timeoutMs: 1.5 }).success).toBe(false);
  });
});

describe('TestCaseSchema [N-08]', () => {
  const base = { schemaVersion: 2, id: ID, name: 'T' };

  it('requires schemaVersion 2 and a uuid id', () => {
    expect(TestCaseSchema.safeParse(base).success).toBe(true);
    expect(TestCaseSchema.safeParse({ ...base, schemaVersion: 1 }).success).toBe(false);
    expect(TestCaseSchema.safeParse({ id: ID, name: 'T' }).success).toBe(false);
    expect(TestCaseSchema.safeParse({ ...base, id: 'abc' }).success).toBe(false);
  });

  it('defaults sessions to ["default"]', () => {
    const tc = TestCaseSchema.parse(base);
    expect(tc.sessions).toEqual(['default']);
    expect(tc.steps).toEqual([]);
    expect(tc.cleanup).toEqual([]);
  });

  it('rejects duplicate step ids across steps and cleanup', () => {
    const r = TestCaseSchema.safeParse({
      ...base,
      steps: [{ id: 's1', action: 'goto' }],
      cleanup: [{ id: 's1', action: 'goto' }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['cleanup', 0, 'id']);
  });

  it('rejects steps using an undeclared session', () => {
    const r = TestCaseSchema.safeParse({
      ...base,
      sessions: ['a'],
      steps: [{ id: 's1', action: 'goto', session: 'b' }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain('"b"');
  });

  it('rejects refs to elements that do not exist', () => {
    const elements = { el_ok: { name: 'OK', strategies: [{ kind: 'text', value: 'OK' }] } };
    const ok = TestCaseSchema.safeParse({
      ...base,
      elements,
      steps: [{ id: 's1', action: 'click', params: { target: { ref: 'el_ok' } } }],
    });
    expect(ok.success).toBe(true);
    const bad = TestCaseSchema.safeParse({
      ...base,
      elements,
      steps: [{ id: 's1', action: 'click', params: { target: { ref: 'el_missing' } } }],
    });
    expect(bad.success).toBe(false);
  });

  it('collectRefs finds nested refs only in {ref} objects', () => {
    expect(
      collectRefs({
        target: { ref: 'a' },
        condition: { assert: 'visible', target: { ref: 'b' } },
        list: [{ ref: 'c' }],
        other: { ref: 'x', extra: 1 },
      }),
    ).toEqual(['a', 'b', 'c']);
  });
});

describe('DatasetSchema [E-03]', () => {
  it('accepts consistent columns and rows', () => {
    expect(
      DatasetSchema.safeParse({
        id: 'd1',
        name: 'Đơn nghỉ',
        columns: ['soNgay', 'lyDo'],
        rows: [{ soNgay: '2', lyDo: 'Ốm' }],
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate or unknown columns', () => {
    expect(
      DatasetSchema.safeParse({ id: 'd', name: 'd', columns: ['a', 'a'], rows: [] }).success,
    ).toBe(false);
    expect(
      DatasetSchema.safeParse({ id: 'd', name: 'd', columns: ['a'], rows: [{ b: '1' }] }).success,
    ).toBe(false);
  });

  it('supports excel, csv, table and saved sources', () => {
    for (const src of [
      { source: 'excel', file: 'a.xlsx', sheet: 'Sheet1' },
      { source: 'csv', file: 'a.csv' },
      { source: 'table', columns: ['a'], rows: [{ a: '1' }] },
      { source: 'saved', datasetId: 'd1' },
    ]) {
      expect(DatasetSourceSchema.safeParse(src).success).toBe(true);
    }
    expect(DatasetSourceSchema.safeParse({ source: 'excel' }).success).toBe(false);
  });
});

describe('EnvSchema', () => {
  it('holds variables and secret names, never secret values', () => {
    const env = EnvSchema.parse({
      id: 'e1',
      name: 'Staging',
      baseUrl: 'https://staging.example.com',
      variables: { portalUrl: 'https://staging.example.com/portal' },
      secretNames: ['nvPass'],
    });
    expect(env.secretNames).toEqual(['nvPass']);
    expect(EnvSchema.safeParse({ id: 'e', name: 'e', baseUrl: 'not a url' }).success).toBe(false);
    expect(EnvSchema.safeParse({ id: 'e', name: 'e', variables: { 'a-b': 'x' } }).success).toBe(
      false,
    );
  });

  it('holds one cell per product key [O-02]', () => {
    const env = EnvSchema.parse({
      id: 'e1',
      name: 'UAT',
      defaultProduct: 'web',
      apps: {
        web: { name: 'Web', url: 'https://uat.example.com' },
        admin: { name: 'Admin', missing: true },
      },
    });
    expect(env.apps.web).toEqual({
      name: 'Web',
      url: 'https://uat.example.com',
      variables: {},
      missing: false,
    });
    expect(env.apps.admin?.missing).toBe(true);
    expect(EnvSchema.safeParse({ id: 'e', name: 'e', apps: { Web: { name: 'W' } } }).success).toBe(
      false,
    );
  });
});

describe('RunResultSchema', () => {
  it('parses a run with a soft failure and cleanup', () => {
    const r = RunResultSchema.parse({
      runId: 'r1',
      testCaseId: ID,
      status: 'failed',
      startedAt: '2026-11-16T09:00:00.000+07:00',
      durationMs: 1200,
      steps: [
        {
          stepId: 's1',
          session: 'default',
          status: 'failed',
          soft: true,
          startedAt: '2026-11-16T09:00:00.100+07:00',
          durationMs: 300,
          error: { code: 'ELEMENT_NOT_FOUND', message: 'Bước 1: Không tìm thấy nút "Lưu"' },
          artifacts: [{ kind: 'screenshot', path: 's1.png' }],
        },
      ],
    });
    expect(r.cleanup).toEqual([]);
    expect(r.steps[0]?.error?.code).toBe('ELEMENT_NOT_FOUND');
  });

  it('rejects unknown statuses and non-ISO dates', () => {
    const run = {
      runId: 'r',
      testCaseId: 't',
      status: 'passed',
      startedAt: '2026-11-16T02:00:00Z',
      durationMs: 1,
      steps: [],
    };
    expect(RunResultSchema.safeParse(run).success).toBe(true);
    expect(RunResultSchema.safeParse({ ...run, status: 'ok' }).success).toBe(false);
    expect(RunResultSchema.safeParse({ ...run, startedAt: '16/11/2026' }).success).toBe(false);
  });
});

describe('Env proxy [G-06]', () => {
  const base = { id: 'e', name: 'Nội bộ' };
  it('accepts http, https and socks5 proxies with bypass list', () => {
    for (const server of [
      'http://proxy.local:3128',
      'https://10.0.0.1:443',
      'socks5://127.0.0.1:1080',
    ]) {
      const env = EnvSchema.parse({
        ...base,
        proxy: { server, bypass: ['localhost', '.corp.local'] },
      });
      expect(env.proxy?.server).toBe(server);
    }
    expect(EnvSchema.parse({ ...base, proxy: { server: 'http://p:8080' } }).proxy?.bypass).toEqual(
      [],
    );
  });

  it('keeps the password as a secret name', () => {
    const env = EnvSchema.parse({
      ...base,
      proxy: { server: 'http://p:8080', username: 'tester', passwordSecret: 'proxyPass' },
    });
    expect(env.proxy).toMatchObject({ username: 'tester', passwordSecret: 'proxyPass' });
  });

  it('rejects bad servers, socks5 auth and password without username', () => {
    const bad = [
      { server: 'ftp://p:21' },
      { server: 'p:8080' },
      { server: 'socks5://p:1080', username: 'u' },
      { server: 'http://p:8080', passwordSecret: 'x' },
    ];
    for (const proxy of bad)
      expect(EnvSchema.safeParse({ ...base, proxy }).success, proxy.server).toBe(false);
  });
});

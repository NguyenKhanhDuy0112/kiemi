import { EnvSchema, TestCaseSchema } from '@kiemi/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../actions';
import { runTestCase } from '../runner';
import { type E2E, startE2E, summary } from './helpers';

/**
 * M9-11 [O-01, O-02]: one test goes through two products on different domains
 * (web = employees, admin = managers); switching the environment swaps URLs and accounts.
 */
let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

const login = (key: string, session: string, n: number) => [
  {
    id: `l${n}`,
    session,
    action: 'goto',
    params: { url: `{{app.${key}}}/login.html` },
  },
  {
    id: `l${n + 1}`,
    session,
    action: 'fill',
    params: { target: { label: 'Tên đăng nhập' }, value: `{{app.${key}.user}}` },
  },
  {
    id: `l${n + 2}`,
    session,
    action: 'fill',
    params: { target: { label: 'Mật khẩu' }, value: `{{app.${key}.pass}}` },
  },
  {
    id: `l${n + 3}`,
    session,
    action: 'click',
    params: { target: { role: 'button', name: 'Đăng nhập' } },
  },
];

const testCase = TestCaseSchema.parse({
  schemaVersion: 2,
  id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f30',
  name: 'Nhân viên (web) và quản lý (admin) trên hai tên miền',
  product: 'web',
  sessions: ['nhanvien', 'quanly'],
  steps: [
    ...login('web', 'nhanvien', 1),
    {
      id: 'a1',
      session: 'nhanvien',
      action: 'assertUrl',
      params: { op: 'contains', value: '{{app.web}}' },
    },
    {
      id: 'a2',
      session: 'nhanvien',
      action: 'assertText',
      params: {
        target: { css: '[data-testid=current-user]' },
        op: 'contains',
        value: '{{app.web.fullName}}',
      },
    },
    ...login('admin', 'quanly', 5),
    {
      id: 'b1',
      session: 'quanly',
      action: 'assertUrl',
      params: { op: 'contains', value: '{{app.admin}}' },
    },
    {
      id: 'b2',
      session: 'quanly',
      action: 'assertText',
      params: {
        target: { css: '[data-testid=current-user]' },
        op: 'contains',
        value: '{{app.admin.fullName}}',
      },
    },
  ],
});

function env(
  name: string,
  web: { user: string; fullName: string },
  admin = { user: 'quanly', fullName: 'Lê Minh Quân' },
) {
  return EnvSchema.parse({
    id: `env-${name}`,
    name,
    defaultProduct: 'web',
    apps: {
      web: { name: 'Web', url: e.site.apps.web, variables: { ...web, pass: '123456' } },
      admin: { name: 'Admin', url: e.site.apps.admin, variables: { ...admin, pass: '123456' } },
    },
  });
}

describe('two products on different domains [O-01, O-02]', () => {
  it('one test logs in to web and admin, and each environment brings its own account', async () => {
    await fetch(`${e.site.url}/api/reset`, { method: 'POST' });
    const registry = createDefaultRegistry();
    for (const [name, web] of [
      ['UAT', { user: 'nhanvien', fullName: 'Nguyễn Văn An' }],
      ['Staging', { user: 'nhanvien2', fullName: 'Trần Thị Bình' }],
    ] as const) {
      const result = await runTestCase(
        {
          runId: `prod-${name}`,
          testCase,
          env: env(name, web),
          options: { defaultStepTimeoutMs: 15_000 },
        },
        { registry, browser: e.browser },
      );
      expect(
        summary(result).filter((s) => !s.includes(' passed')),
        name,
      ).toEqual([]);
      expect(result.status).toBe('passed');
    }
  });

  it('fails clearly when the admin product has no cell in the environment', async () => {
    const missing = EnvSchema.parse({
      id: 'env-x',
      name: 'Prod',
      defaultProduct: 'web',
      apps: {
        web: { name: 'Web', url: e.site.apps.web, variables: { user: 'nhanvien', pass: '123456' } },
        admin: { name: 'Admin', missing: true },
      },
    });
    const result = await runTestCase(
      { runId: 'prod-missing', testCase, env: missing, options: { defaultStepTimeoutMs: 15_000 } },
      { registry: createDefaultRegistry(), browser: e.browser },
    );
    expect(result.status).toBe('failed');
    expect(summary(result).some((s) => s.includes('failed'))).toBe(true);
  });
});

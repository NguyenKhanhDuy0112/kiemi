import { type StepInput, TestCaseSchema } from '@kiemi/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../actions';
import type { EngineEvent } from '../events';
import type { SavedLogin } from '../run/services';
import { type RunRequest, runTestCase } from '../runner';
import { type E2E, startE2E, step, summary } from './helpers';

let e: E2E;
beforeAll(async () => {
  e = await startE2E();
  await fetch(`${e.site.url}/api/reset`, { method: 'POST' });
});
afterAll(async () => {
  await e?.close();
});

let n = 0;
async function run(steps: StepInput[], extra: Partial<RunRequest> = {}, now?: () => Date) {
  const events: EngineEvent[] = [];
  const testCase = TestCaseSchema.parse({
    schemaVersion: 2,
    id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f14',
    name: 'login',
    steps: steps.map((s, i) => ({ ...s, id: `s${i + 1}` })),
  });
  const result = await runTestCase(
    {
      runId: `login-${++n}`,
      testCase,
      env: {
        id: 'demo',
        name: 'Demo',
        baseUrl: e.site.url,
        variables: {},
        secretNames: [],
        apps: {},
      },
      ...extra,
    },
    {
      registry: createDefaultRegistry(),
      browser: e.browser,
      onEvent: (ev) => events.push(ev),
      ...(now ? { now } : {}),
    },
  );
  return { result, events };
}

describe('saved logins [F-02]', () => {
  it('saves a login once and reuses it in a later test until it expires', async () => {
    const t0 = new Date();
    const first = await run(
      [
        step('goto', { url: '/login.html' }),
        step('fill', { target: { css: '#username' }, value: 'nhanvien' }),
        step('fill', { target: { css: '#password' }, value: '123456' }),
        step('press', { keys: 'Enter', target: { css: '#password' } }),
        step('assertUrl', { op: 'contains', value: '/form.html' }),
        step('saveSession', { name: 'nhanVien', ttlHours: 2 }),
      ],
      {},
      () => t0,
    );
    expect(summary(first.result).filter((s) => !s.endsWith('passed'))).toEqual([]);
    const saved = first.events.find((x) => x.type === 'loginSaved');
    if (saved?.type !== 'loginSaved') throw new Error('no loginSaved event');
    expect(saved.name).toBe('nhanVien');
    expect(saved.login.expiresAt).toBe(new Date(t0.getTime() + 2 * 3_600_000).toISOString());
    expect(saved.login.state.cookies.length).toBeGreaterThan(0);
    const savedLogins: Record<string, SavedLogin> = { nhanVien: saved.login };

    // Reused: the guarded page opens directly, without the login form.
    const reuse = await run(
      [
        step('useSession', { name: 'nhanVien' }),
        step('goto', { url: '/form.html' }),
        step('assertUrl', { op: 'contains', value: '/form.html' }),
      ],
      { savedLogins },
    );
    expect(summary(reuse.result)).toEqual(['1 passed', '2 passed', '3 passed']);

    // Without it, the same page sends you to the login form.
    const without = await run([
      step('goto', { url: '/form.html' }),
      step('assertUrl', { op: 'contains', value: '/login.html' }),
    ]);
    expect(summary(without.result)).toEqual(['1 passed', '2 passed']);

    const later = new Date(t0.getTime() + 3 * 3_600_000);
    const expired = await run(
      [step('useSession', { name: 'nhanVien' })],
      { savedLogins },
      () => later,
    );
    expect(summary(expired.result)).toEqual(['1 failed LOGIN_EXPIRED']);
    const missing = await run([step('useSession', { name: 'khac' })], { savedLogins });
    expect(summary(missing.result)).toEqual(['1 failed LOGIN_NOT_SAVED']);
  });
});

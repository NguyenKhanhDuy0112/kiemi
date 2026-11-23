import { TestCaseSchema } from '@kiemi/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../actions';
import type { SessionPages } from '../browser';
import { runTestCase } from '../runner';
import { type E2E, startE2E, summary } from './helpers';

let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

describe('stop after step X and keep the sessions [K-04]', () => {
  it('skips later steps and cleanup, and hands over the open pages', async () => {
    let kept: SessionPages | undefined;
    const testCase = TestCaseSchema.parse({
      schemaVersion: 2,
      id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f12',
      name: 'keep',
      steps: [
        { id: 's1', action: 'goto', params: { url: '/login.html' } },
        { id: 's2', action: 'fill', params: { target: { css: '#username' }, value: 'nhanvien' } },
        { id: 's3', action: 'fill', params: { target: { css: '#username' }, value: 'khac' } },
      ],
      cleanup: [{ id: 'c1', action: 'goto', params: { url: '/index.html' } }],
    });
    const result = await runTestCase(
      {
        runId: 'keep-1',
        testCase,
        env: {
          id: 'demo',
          name: 'Demo',
          baseUrl: e.site.url,
          variables: {},
          secretNames: [],
          apps: {},
          type: 'other',
          protected: false,
        },
        options: { stopAfterStepId: 's2' },
      },
      { registry: createDefaultRegistry(), browser: e.browser, keepSessions: (p) => (kept = p) },
    );
    expect(summary(result)).toEqual(['1 passed', '2 passed', '3 skipped']);
    expect(result.cleanup).toEqual([]);
    expect(result.status).toBe('passed');
    if (!kept) throw new Error('sessions not kept');
    const page = await kept.page('default');
    expect(page.url()).toContain('/login.html');
    expect(await page.locator('#username').inputValue()).toBe('nhanvien');
    await kept.closeAll();
  });
});

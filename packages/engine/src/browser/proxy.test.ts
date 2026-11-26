import { type DemoServer, startDemoServer } from '@kiemi/demo-site/server';
import { type Env, EnvSchema, type TestCase } from '@kiemi/schema';
import type { Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ActionRegistry, defineAction } from '../define-action';
import { EngineError } from '../errors';
import { runTestCase } from '../runner';
import { launchTestBrowser } from '../testing/browser';
import { startHttpProxy, startSocks5Proxy, type TestProxy } from '../testing/proxies';
import { proxyFor } from './proxy';

/** Only resolvable "behind" the test proxies (`.test` is a reserved TLD). */
const INTERNAL = 'kiemi-internal.test';

let browser: Browser;
let demo: DemoServer;
beforeAll(async () => {
  [browser, demo] = await Promise.all([launchTestBrowser(), startDemoServer()]);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await demo?.close();
});

const port = () => new URL(demo.url).port;
const env = (proxy: unknown): Env => EnvSchema.parse({ id: 'e', name: 'Nội bộ', proxy });

const titles: string[] = [];
const registry = new ActionRegistry([
  defineAction({
    type: 'openTitle',
    params: z.object({ url: z.string() }),
    ui: { label: 'test.open', icon: 'globe', group: 'test' },
    async execute({ url }, ctx) {
      const page = await ctx.page();
      await page.goto(url, { timeout: ctx.timeoutMs });
      titles.push(await page.title());
    },
  }),
]);

const testCase = (url: string): TestCase => ({
  schemaVersion: 2,
  id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f0a',
  name: 'proxy',
  tags: [],
  sessions: ['default'],
  elements: {},
  variables: {},
  steps: [
    {
      id: 's1',
      action: 'openTitle',
      params: { url },
      session: 'default',
      enabled: true,
      mode: 'hard',
    },
  ],
  cleanup: [],
});

async function openThrough(e: Env, secrets: Record<string, string> = {}) {
  titles.length = 0;
  return runTestCase(
    {
      runId: 'r',
      testCase: testCase(`http://${INTERNAL}:${port()}/webforms.aspx`),
      env: e,
      secrets,
      options: { defaultStepTimeoutMs: 8000 },
    },
    { registry, browser },
  );
}

describe('proxy settings [G-06]', () => {
  it('maps env proxy to Playwright settings with the password from secrets', () => {
    expect(proxyFor(undefined)).toBeUndefined();
    expect(
      proxyFor(
        env({
          server: 'http://p:8080/',
          username: 'u',
          passwordSecret: 'proxyPass',
          bypass: ['localhost', '.corp'],
        }),
        {
          proxyPass: 's3cret',
        },
      ),
    ).toEqual({
      server: 'http://p:8080',
      username: 'u',
      password: 's3cret',
      bypass: 'localhost,.corp',
    });
  });

  it('reports a missing proxy secret', () => {
    let err: unknown;
    try {
      proxyFor(env({ server: 'http://p:8080', username: 'u', passwordSecret: 'proxyPass' }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).code).toBe('PROXY_SECRET_MISSING');
  });
});

describe('browsing through a proxy [G-06]', () => {
  let proxy: TestProxy | undefined;
  afterAll(async () => {
    await proxy?.close();
  });

  it('HTTP proxy with auth: internal host name resolved by the proxy', async () => {
    proxy = await startHttpProxy({
      hosts: { [INTERNAL]: '127.0.0.1' },
      auth: { username: 'tester', password: 's3cret' },
    });
    const r = await openThrough(
      env({ server: proxy.url, username: 'tester', passwordSecret: 'proxyPass' }),
      {
        proxyPass: 's3cret',
      },
    );
    expect(r.steps[0]?.error).toBeUndefined();
    expect(titles).toEqual(['Hồ sơ nhân viên (WebForms)']);
    expect(proxy.seen).toContain(INTERNAL);
    await proxy.close();
    proxy = undefined;
  });

  it('SOCKS5 proxy: DNS goes through the proxy', async () => {
    proxy = await startSocks5Proxy({ hosts: { [INTERNAL]: '127.0.0.1' } });
    const r = await openThrough(env({ server: proxy.url }));
    expect(r.steps[0]?.error).toBeUndefined();
    expect(titles).toEqual(['Hồ sơ nhân viên (WebForms)']);
    expect(proxy.seen).toContain(INTERNAL);
    await proxy.close();
    proxy = undefined;
  });

  it('bypass list sends matching hosts directly', async () => {
    proxy = await startHttpProxy({ hosts: { [INTERNAL]: '127.0.0.1' } });
    const r = await openThrough(env({ server: proxy.url, bypass: [INTERNAL] }));
    // Going direct, the internal name cannot be resolved on this machine.
    expect(r.status).toBe('failed');
    expect(r.steps[0]?.error?.message).toMatch(/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/);
    expect(proxy.seen).not.toContain(INTERNAL);
  });

  it('without proxy the internal name does not resolve', async () => {
    const r = await openThrough(env(undefined));
    expect(r.status).toBe('failed');
  });
});

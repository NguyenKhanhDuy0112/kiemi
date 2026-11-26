import type { TestCase } from '@kiemi/schema';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ActionRegistry, defineAction } from '../define-action';
import { runTestCase } from '../runner';
import { launchTestBrowser } from '../testing/browser';
import { contextEmulation, listDevices } from './options';

let browser: Browser;
beforeAll(async () => {
  browser = await launchTestBrowser();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

type Probe = {
  session: string;
  width: number;
  height: number;
  ua: string;
  touch: boolean;
  cookie: string;
};

function probeRegistry(out: Probe[], pages: Page[]) {
  return new ActionRegistry([
    defineAction({
      type: 'probe',
      params: z.object({ setCookie: z.string().optional() }),
      ui: { label: 'test.probe', icon: 'bug', group: 'test' },
      async execute(params, ctx) {
        const page = await ctx.page();
        pages.push(page);
        await page.setContent('<meta name="viewport" content="width=device-width"><p>x</p>');
        const context = await ctx.context();
        if (params.setCookie) {
          await context.addCookies([
            { name: 'c', value: params.setCookie, url: 'https://kiemi.test' },
          ]);
        }
        const cookie = (await context.cookies('https://kiemi.test'))[0]?.value ?? '';
        out.push({
          session: ctx.session,
          cookie,
          ...(await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
            ua: navigator.userAgent,
            touch: navigator.maxTouchPoints > 0,
          }))),
        });
      },
    }),
  ]);
}

const tc = (steps: TestCase['steps'], sessions = ['default']): TestCase => ({
  schemaVersion: 2,
  id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f09',
  name: 't',
  tags: [],
  sessions,
  elements: {},
  variables: {},
  steps,
  cleanup: [],
});
const step = (id: string, session = 'default', params: Record<string, unknown> = {}) => ({
  id,
  action: 'probe',
  params,
  session,
  enabled: true,
  mode: 'hard' as const,
});

describe('viewport & device emulation [G-03]', () => {
  it('uses the default window size', async () => {
    const out: Probe[] = [];
    const r = await runTestCase(
      { runId: 'r', testCase: tc([step('s1')]) },
      { registry: probeRegistry(out, []), browser },
    );
    expect(r.steps[0]?.error).toBeUndefined();
    expect(out[0]).toMatchObject({ width: 1366, height: 768, touch: false });
  });

  it('applies a custom viewport', async () => {
    const out: Probe[] = [];
    await runTestCase(
      {
        runId: 'r',
        testCase: tc([step('s1')]),
        options: { viewport: { viewport: { width: 1024, height: 700 } } },
      },
      { registry: probeRegistry(out, []), browser },
    );
    expect(out[0]).toMatchObject({ width: 1024, height: 700 });
  });

  it('emulates a mobile device', async () => {
    const out: Probe[] = [];
    await runTestCase(
      { runId: 'r', testCase: tc([step('s1')]), options: { viewport: { device: 'iPhone 13' } } },
      { registry: probeRegistry(out, []), browser },
    );
    expect(out[0]).toMatchObject({ width: 390, touch: true });
    expect(out[0]?.ua).toContain('iPhone');
  });

  it('rejects unknown devices and lists known ones', () => {
    expect(listDevices()).toContain('Pixel 7');
    expect(() => contextEmulation({ device: 'Nokia 3310' })).toThrow(/Unknown device/);
  });
});

describe('session pages', () => {
  it('reuses one page per session, isolates sessions and closes them after the run', async () => {
    const out: Probe[] = [];
    const pages: Page[] = [];
    const r = await runTestCase(
      {
        runId: 'r',
        testCase: tc(
          [step('s1', 'A', { setCookie: 'a' }), step('s2', 'B'), step('s3', 'A')],
          ['A', 'B'],
        ),
      },
      { registry: probeRegistry(out, pages), browser },
    );
    expect(r.status).toBe('passed');
    expect(out.map((o) => [o.session, o.cookie])).toEqual([
      ['A', 'a'],
      ['B', ''],
      ['A', 'a'],
    ]);
    expect(pages[0]).toBe(pages[2]);
    expect(pages[0]).not.toBe(pages[1]);
    expect(pages.every((p) => p.isClosed())).toBe(true);
  });

  it('fails the step with NO_BROWSER when the run has no browser', async () => {
    const r = await runTestCase(
      { runId: 'r', testCase: tc([step('s1')]) },
      { registry: probeRegistry([], []) },
    );
    expect(r.steps[0]?.error?.code).toBe('NO_BROWSER');
  });
});

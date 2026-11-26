import type { PopupRule } from '@kiemi/schema';
import { TestCaseSchema } from '@kiemi/schema';
import type { Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ActionRegistry, defineAction } from '../define-action';
import { closePopups } from '../run/popups';
import { runTestCase } from '../runner';
import { launchTestBrowser } from '../testing/browser';

/** W-09: "if you see X, press Y" closes popups that show up at random. */
let browser: Browser;
beforeAll(async () => {
  browser = await launchTestBrowser();
});
afterAll(async () => {
  await browser?.close();
});

const rule = (over: Partial<PopupRule> = {}): PopupRule => ({
  id: 'cookie',
  name: 'Banner cookie',
  enabled: true,
  when: { strategies: [{ kind: 'text', value: 'Chúng tôi dùng cookie' }] },
  action: {
    kind: 'click',
    target: { strategies: [{ kind: 'role', role: 'button', name: 'Đồng ý' }] },
  },
  ...over,
});
const page = `<div id="b" style="position:fixed;inset:0;background:#fff">
  <p>Chúng tôi dùng cookie</p><button onclick="document.getElementById('b').remove()">Đồng ý</button></div>
  <button id="real">Lưu</button>`;
const same = <T>(v: T) => v;

describe('closePopups [W-09]', () => {
  it('clicks the button of a rule whose popup is on the page', async () => {
    const p = await (await browser.newContext()).newPage();
    await p.setContent(page);
    expect(await closePopups(p, [rule()], same)).toEqual(['Banner cookie']);
    expect(await p.locator('#b').count()).toBe(0);
    await p.context().close();
  });

  it('does nothing — and does not wait — when no popup is there or the rule is off', async () => {
    const p = await (await browser.newContext()).newPage();
    await p.setContent('<button id="real">Lưu</button>');
    const t = Date.now();
    expect(await closePopups(p, [rule()], same)).toEqual([]);
    expect(Date.now() - t).toBeLessThan(1500);
    await p.setContent(page);
    expect(await closePopups(p, [rule({ enabled: false })], same)).toEqual([]);
    expect(await p.locator('#b').count()).toBe(1);
    await p.context().close();
  });

  it('presses Escape for rules that close with the keyboard', async () => {
    const p = await (await browser.newContext()).newPage();
    await p.setContent(
      `<p id="m">Khảo sát</p><script>addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('m').remove()})</script>`,
    );
    const esc = rule({
      id: 'survey',
      name: 'Khảo sát',
      when: { strategies: [{ kind: 'text', value: 'Khảo sát' }] },
      action: { kind: 'escape' },
    });
    expect(await closePopups(p, [esc], same)).toEqual(['Khảo sát']);
    await p.context().close();
  });

  it('a step blocked by a popup passes after the run closes it and retries', async () => {
    const setup = defineAction({
      type: 'setup',
      params: z.object({}),
      ui: { label: 'actions.setup', icon: 'x', group: 'test' },
      execute: async (_p, ctx) => {
        await (await ctx.page()).setContent(page);
      },
    });
    const save = defineAction({
      type: 'save',
      params: z.object({}),
      ui: { label: 'actions.save', icon: 'x', group: 'test' },
      execute: async (_p, ctx) => {
        await (await ctx.page()).locator('#real').click({ timeout: 800 });
      },
    });
    const testCase = TestCaseSchema.parse({
      schemaVersion: 2,
      id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f77',
      name: 'popup',
      steps: [
        { id: 's1', action: 'setup', params: {} },
        { id: 's2', action: 'save', params: {} },
      ],
    });
    const registry = new ActionRegistry([setup, save]);
    const withRule = await runTestCase(
      { runId: 'r1', testCase, popupRules: [rule()] },
      { registry, browser },
    );
    expect(withRule.status).toBe('passed');
    const without = await runTestCase({ runId: 'r2', testCase }, { registry, browser });
    expect(without.status).toBe('failed');
  });
});

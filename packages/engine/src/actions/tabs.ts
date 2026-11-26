import { z } from 'zod';
import { BROWSER_KINDS } from '../browser/detect';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { left, text } from './_common';

/** Open a new tab (optionally at a URL); it becomes the active tab [A-13]. */
export const newTabAction = defineAction({
  type: 'newTab',
  params: z.object({ url: text.optional(), name: text.optional() }),
  ui: { label: 'actions.newTab', icon: 'app-window', group: 'tabs' },
  async execute({ url, name }, ctx) {
    const context = await ctx.context();
    await ctx.page(); // make sure the session exists first
    const page = await context.newPage();
    if (name) ctx.run.pages.nameTab(ctx.session, name, page);
    await ctx.run.pages.setActivePage(ctx.session, page);
    if (url) await page.goto(ctx.run.url(url), { timeout: left(ctx) });
  },
});

/** Switch to another tab by position, title or URL [A-13]. Waits for it to open. */
export const switchTabAction = defineAction({
  type: 'switchTab',
  params: z.object({ by: z.enum(['index', 'title', 'url', 'name']).default('index'), value: text }),
  ui: { label: 'actions.switchTab', icon: 'arrow-right-left', group: 'tabs' },
  async execute({ by, value }, ctx) {
    const deadline = Date.now() + left(ctx);
    for (;;) {
      const pages = await ctx.run.pages.pages(ctx.session);
      let found =
        by === 'index'
          ? pages[Number(value) - 1]
          : by === 'name'
            ? ctx.run.pages.tabNamed(ctx.session, value)
            : undefined;
      if (by === 'title' || by === 'url') {
        for (const p of pages) {
          const hay = by === 'url' ? p.url() : await p.title().catch(() => '');
          if (hay.toLowerCase().includes(value.toLowerCase())) {
            found = p;
            break;
          }
        }
      }
      if (found) {
        await ctx.run.pages.setActivePage(ctx.session, found);
        await found
          .waitForLoadState('domcontentloaded', { timeout: left(ctx) })
          .catch(() => undefined);
        return;
      }
      if (Date.now() > deadline - 150) {
        throw new EngineError('TAB_NOT_FOUND', `No tab with ${by} "${value}"`, {
          by,
          value,
          tabs: pages.length,
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  },
});

/** Close the active tab (or the N-th); the previous tab becomes active [A-13]. */
export const closeTabAction = defineAction({
  type: 'closeTab',
  params: z.object({ index: z.number().int().positive().optional(), name: text.optional() }),
  ui: { label: 'actions.closeTab', icon: 'x', group: 'tabs' },
  async execute({ index, name }, ctx) {
    const pages = await ctx.run.pages.pages(ctx.session);
    const page = name
      ? ctx.run.pages.tabNamed(ctx.session, name)
      : index === undefined
        ? await ctx.page()
        : pages[index - 1];
    if (!page)
      throw new EngineError('TAB_NOT_FOUND', `No tab ${name ?? `number ${index}`}`, {
        by: name ? 'name' : 'index',
        value: name ?? index,
        tabs: pages.length,
      });
    await page.close();
    const rest = (await ctx.run.pages.pages(ctx.session)).filter((p) => p !== page);
    const next = rest.at(-1);
    if (next) await ctx.run.pages.setActivePage(ctx.session, next);
  },
});

/**
 * Name the tab that a previous step opened (`target=_blank`, `window.open`) and
 * make it the active one. Waits for it to appear [V-01].
 */
export const captureTabAction = defineAction({
  type: 'captureTab',
  params: z.object({ name: text, urlContains: text.optional() }),
  ui: { label: 'actions.captureTab', icon: 'app-window', group: 'tabs' },
  async execute({ name, urlContains }, ctx) {
    await ctx.page();
    const deadline = Date.now() + left(ctx);
    for (;;) {
      const pages = await ctx.run.pages.pages(ctx.session);
      const fresh = pages.filter(
        (p) =>
          ctx.run.pages.nameOf(ctx.session, p) === undefined &&
          (!urlContains || p.url().includes(urlContains)),
      );
      const found = fresh.at(-1);
      if (found) {
        ctx.run.pages.nameTab(ctx.session, name, found);
        await ctx.run.pages.setActivePage(ctx.session, found);
        await found
          .waitForLoadState('domcontentloaded', { timeout: left(ctx) })
          .catch(() => undefined);
        return;
      }
      if (Date.now() > deadline - 150) {
        throw new EngineError('TAB_NOT_FOUND', `No new tab to name "${name}"`, {
          by: 'new',
          value: name,
          tabs: pages.length,
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  },
});

/** Check how many tabs the session has open (waits until it matches) [V-01]. */
export const assertTabCountAction = defineAction({
  type: 'assertTabCount',
  params: z.object({ count: z.number().int().nonnegative() }),
  ui: { label: 'actions.assertTabCount', icon: 'app-window', group: 'assert' },
  async execute({ count }, ctx) {
    await ctx.page();
    const deadline = Date.now() + left(ctx);
    for (;;) {
      const n = (await ctx.run.pages.pages(ctx.session)).length;
      if (n === count) return;
      if (Date.now() > deadline - 150) {
        throw new EngineError('ASSERTION_FAILED', `Expected ${count} tab(s), found ${n}`, {
          expected: count,
          actual: n,
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  },
});

/**
 * Open a page in ANOTHER session (other role, or a fresh anonymous visitor) or
 * in another browser (Edge vs Chrome) — the session is created on first use.
 * Later steps use it through their own `session` [V-02].
 */
export const openInAction = defineAction({
  type: 'openIn',
  params: z.object({
    session: text,
    url: text,
    browser: z.enum(['same', ...BROWSER_KINDS]).default('same'),
    name: text.optional(),
  }),
  ui: { label: 'actions.openIn', icon: 'app-window', group: 'tabs' },
  async execute({ session, url, browser, name }, ctx) {
    const pages = ctx.run.pages;
    await ctx.page();
    const fresh = !pages.isOpen(session);
    if (browser !== 'same') pages.useBrowser(session, browser);
    const first = await pages.page(session);
    let page = first;
    if (!fresh) {
      page = await (await pages.context(session)).newPage();
      await pages.setActivePage(session, page);
    }
    if (name) pages.nameTab(session, name, page);
    await page.goto(ctx.run.url(url), { timeout: left(ctx) });
    ctx.log(`Opened ${url} in session "${session}"${browser === 'same' ? '' : ` (${browser})`}`);
  },
});

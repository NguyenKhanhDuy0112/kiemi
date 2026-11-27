import type { Page } from 'playwright-core';
import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { text } from './_common';

interface PageProblem {
  url: string;
  problems: string[];
}

function fail(stepNo: string, check: string, found: string[], extra: Record<string, unknown> = {}) {
  throw new EngineError(
    'ASSERTION_FAILED',
    `Step ${stepNo}: ${check}: ${found.length} problem(s) — ${found.slice(0, 4).join('; ')}${found.length > 4 ? '; …' : ''}`,
    {
      check,
      op: 'audit',
      expected: 'no problems',
      actual: found.join('\n'),
      problems: found,
      ...extra,
    },
  );
}

/**
 * Walks the site from a page by following same-site links (GET only, never
 * clicks) and lists broken links, failed images/files, script errors and slow
 * pages. It uses the session's login, so each account sees its own pages [R-11].
 */
export const crawlAction = defineAction({
  type: 'crawl',
  params: z.object({
    start: text.optional(),
    maxPages: z.coerce.number().int().min(1).max(200).default(30),
    /** A page slower than this (ms) to load is reported. */
    slowMs: z.coerce.number().int().positive().default(5000),
    /** Links containing any of these words are not opened. */
    skip: z.array(z.string().min(1)).default(['logout', 'dang-xuat', 'delete', 'xoa', 'signout']),
    timeoutSec: z.coerce.number().positive().max(1800).default(120),
  }),
  ui: { label: 'actions.crawl', icon: 'network', group: 'assert' },
  container: true,
  async execute(p, ctx) {
    const context = await ctx.context();
    const first = await ctx.page();
    const origin = new URL(p.start ? ctx.run.url(p.start) : first.url()).origin;
    const startUrl = p.start ? ctx.run.url(p.start) : first.url();
    const norm = (u: string) => {
      const x = new URL(u);
      x.hash = '';
      return x.toString();
    };
    const queue = [norm(startUrl)];
    const seen = new Set(queue);
    const found: PageProblem[] = [];
    const deadline = Date.now() + p.timeoutSec * 1000;
    const page: Page = await context.newPage();
    let visited = 0;
    try {
      while (queue.length > 0 && visited < p.maxPages && Date.now() < deadline) {
        if (ctx.signal.aborted) break;
        const url = queue.shift() as string;
        visited++;
        const problems: string[] = [];
        const onResp = (r: { status(): number; url(): string }) => {
          if (r.status() >= 400 && !/favicon\.ico/.test(r.url()))
            problems.push(`${r.status()} ${r.url()}`);
        };
        const onFail = (r: { url(): string; failure(): { errorText: string } | null }) => {
          if (!/favicon\.ico/.test(r.url())) problems.push(`failed to load ${r.url()}`);
        };
        const onErr = (e: Error) => problems.push(`script error: ${e.message}`);
        page.on('response', onResp);
        page.on('requestfailed', onFail);
        page.on('pageerror', onErr);
        const started = Date.now();
        try {
          const res = await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
          const took = Date.now() - started;
          if (took > p.slowMs) problems.push(`slow page (${took} ms)`);
          if (res?.ok()) {
            const links = await page.evaluate(() =>
              [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href),
            );
            for (const l of links) {
              if (!/^https?:/.test(l)) continue;
              const n = norm(l);
              if (new URL(n).origin !== origin || seen.has(n)) continue;
              if (p.skip.some((w) => n.toLowerCase().includes(w.toLowerCase()))) continue;
              seen.add(n);
              queue.push(n);
            }
          }
        } catch (err) {
          problems.push(`could not open: ${(err as Error).message.split('\n')[0]}`);
        } finally {
          page.off('response', onResp);
          page.off('requestfailed', onFail);
          page.off('pageerror', onErr);
        }
        if (problems.length) found.push({ url, problems: [...new Set(problems)] });
      }
    } finally {
      await page.close().catch(() => undefined);
    }
    ctx.log(`Crawled ${visited} page(s), ${found.length} with problems`);
    if (found.length)
      fail(
        ctx.stepNo,
        'crawl',
        found.map((f) => `${f.url} → ${f.problems.join(', ')}`),
        { pages: found, visited },
      );
  },
});

const XSS_MARK = '"><img src=x onerror="window.__kiemiXss=1">kiemixss';
const SESSION_NAME = /sess|sid|token|auth|jwt/i;

/**
 * Basic, non-destructive security checks (GET only; refused on Production)
 * [R-12]: session cookies flags, pages that open without logging in, other
 * people's records (IDOR), and reflected scripts.
 */
export const securityScanAction = defineAction({
  type: 'securityScan',
  params: z.object({
    /** Check the session cookies are HttpOnly (and Secure on https). */
    cookies: z.boolean().default(true),
    /** Pages that need a login: they must not open without one. */
    needLogin: z.array(text).default([]),
    loginPath: z.string().min(1).default('login'),
    /** Records of OTHER people (full URLs or paths): this account must not read them. */
    otherPeople: z.array(text).default([]),
    /** Pages echoing a query value: `/search?q=` — a script must not run or come back raw. */
    reflect: z.array(text).default([]),
  }),
  ui: { label: 'actions.securityScan', icon: 'shield-alert', group: 'assert' },
  container: true,
  async execute(p, ctx) {
    const env = ctx.run.env;
    if (env?.type === 'production' || env?.protected) {
      throw new EngineError(
        'PROTECTED_ENVIRONMENT',
        `Step ${ctx.stepNo}: security checks do not run on "${env.name}"`,
        { environment: env.name },
      );
    }
    const problems: string[] = [];
    const context = await ctx.context();
    const first = await ctx.page();

    if (p.cookies) {
      for (const c of await context.cookies()) {
        if (!SESSION_NAME.test(c.name)) continue;
        if (!c.httpOnly) problems.push(`cookie "${c.name}" is readable by scripts (no HttpOnly)`);
        if (!c.secure && first.url().startsWith('https:'))
          problems.push(`cookie "${c.name}" is sent over plain http (no Secure)`);
      }
    }

    const asked = async (path: string, anonymous: boolean) => {
      const url = ctx.run.url(path);
      if (!anonymous) return context.request.get(url, { maxRedirects: 0, failOnStatusCode: false });
      const { request } = await import('playwright-core');
      const api = await request.newContext();
      try {
        const r = await api.get(url, { maxRedirects: 0, failOnStatusCode: false });
        return { status: () => r.status(), headers: () => r.headers(), text: () => r.text() };
      } finally {
        await api.dispose();
      }
    };
    const blocked = (status: number, location: string | undefined) =>
      status === 401 ||
      status === 403 ||
      status === 404 ||
      ([301, 302, 303, 307, 308].includes(status) &&
        new RegExp(p.loginPath, 'i').test(location ?? ''));

    for (const path of p.needLogin) {
      const r = await asked(path, true);
      if (!blocked(r.status(), r.headers().location))
        problems.push(`${path} opens without logging in (HTTP ${r.status()})`);
    }
    for (const path of p.otherPeople) {
      const r = await asked(path, false);
      if (r.status() >= 200 && r.status() < 300)
        problems.push(`${path} shows another person's data to this account (HTTP ${r.status()})`);
    }
    for (const path of p.reflect) {
      const sep = path.includes('?') ? '' : '';
      const url = ctx.run.url(`${path}${sep}${encodeURIComponent(XSS_MARK)}`);
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 15_000 });
        const ran = await page.evaluate(
          () => (window as unknown as { __kiemiXss?: number }).__kiemiXss === 1,
        );
        if (ran) problems.push(`${path}: the page runs a script taken from the address`);
        else if ((await page.content()).includes('<img src=x onerror='))
          problems.push(`${path}: the address is printed without escaping`);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
    if (problems.length) fail(ctx.stepNo, 'security', problems);
  },
});

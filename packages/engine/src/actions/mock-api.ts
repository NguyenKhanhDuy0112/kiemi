import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { text } from './_common';

/** Mocks installed per context, to remove them again with `off`. */
const installed = new WeakMap<object, Map<string, (r: never) => unknown>>();

function toMatcher(url: string): string | RegExp {
  const m = /^\/(.+)\/([a-z]*)$/.exec(url);
  if (m?.[1]) {
    try {
      return new RegExp(m[1], m[2]);
    } catch {
      throw new EngineError('INVALID_PARAMS', `"${url}" is not a valid pattern`, { param: 'url' });
    }
  }
  // `/api/orders` matches that path on any host; a glob (`**/api/*`) is kept as is.
  if (url.startsWith('/') && !url.includes('*')) return `**${url}`;
  return url;
}

/**
 * Fakes the answer of an API call the page makes, to see how the page copes [X-07]:
 * a server error (`error`), nothing coming back in time (`timeout`), an empty list
 * (`empty`), your own answer (`respond`), or `off` to stop faking that address.
 */
export const mockApiAction = defineAction({
  type: 'mockApi',
  params: z.object({
    /** Address part (`/api/orders`), a glob (`**\/api/*`) or `/regex/`. */
    url: text,
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
    mode: z.enum(['respond', 'error', 'timeout', 'empty', 'off']).default('error'),
    /** Status for `respond` / `error` (error defaults to 500). */
    status: z.coerce.number().int().min(100).max(599).optional(),
    /** Answer body for `respond`: JSON or text. */
    body: z.unknown().optional(),
    /** Wait this long before answering (slow server). */
    delayMs: z.coerce.number().int().min(0).max(60_000).default(0),
  }),
  ui: { label: 'actions.mockApi', icon: 'wand-sparkles', group: 'flow' },
  async execute(p, ctx) {
    const context = await ctx.context();
    await ctx.page();
    const matcher = toMatcher(p.url);
    const key = `${p.method ?? '*'} ${String(matcher)}`;
    const mine = installed.get(context) ?? new Map();
    installed.set(context, mine);
    const previous = mine.get(key);
    if (previous) {
      await context.unroute(matcher, previous as never);
      mine.delete(key);
    }
    if (p.mode === 'off') return;
    const handler = async (route: import('playwright-core').Route) => {
      if (p.method && route.request().method() !== p.method) return route.fallback();
      if (p.delayMs) await new Promise((r) => setTimeout(r, p.delayMs));
      switch (p.mode) {
        case 'timeout':
          return route.abort('timedout');
        case 'empty':
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        case 'error':
          return route.fulfill({
            status: p.status ?? 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Lỗi giả lập' }),
          });
        default: {
          const isText = typeof p.body === 'string';
          return route.fulfill({
            status: p.status ?? 200,
            contentType: isText ? 'text/plain' : 'application/json',
            body: isText ? (p.body as string) : JSON.stringify(p.body ?? {}),
          });
        }
      }
    };
    mine.set(key, handler as never);
    await context.route(matcher, handler);
    ctx.log(`Mock ${p.mode} ${p.url}`);
  },
});

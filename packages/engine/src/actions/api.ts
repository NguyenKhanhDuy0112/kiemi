import { type APIRequestContext, request } from 'playwright-core';
import { z } from 'zod';
import { compareText, TextMatchOptions, TextOpSchema } from '../assertions/compare';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { stringify } from '../vars/evaluate';
import { left, text } from './_common';

/** Reads `data.items[0].id` from a JSON value. */
export function readPath(value: unknown, path: string): unknown {
  let cur = value;
  for (const part of path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Call an HTTP API [F-03]: method, URL, headers, JSON/form body; save the
 * response (`{ status, ok, headers, body }`) into a variable; check status and
 * fields. Shares cookies with the step's session when a browser is running.
 */
export const apiAction = defineAction({
  type: 'api',
  params: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
    url: text,
    headers: z.record(z.string(), text).default({}),
    body: z.unknown().optional(),
    bodyType: z.enum(['json', 'form', 'text']).default('json'),
    saveTo: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      .optional(),
    expectStatus: z.union([z.coerce.number().int(), z.array(z.coerce.number().int())]).optional(),
    expectFields: z
      .array(
        z.object({
          path: z.string().min(1),
          op: TextOpSchema.default('equals'),
          value: z.unknown().optional(),
          ...TextMatchOptions,
        }),
      )
      .default([]),
  }),
  // POST/PUT/PATCH/DELETE change data on the server [W-10].
  writes: (p) => !['GET', 'HEAD'].includes(String(p.method ?? 'GET').toUpperCase()),
  ui: { label: 'actions.api', icon: 'webhook', group: 'data' },
  async execute(p, ctx) {
    const url = ctx.run.url(p.url);
    let api: APIRequestContext;
    let dispose = false;
    if (ctx.run.pages.hasBrowser) api = (await ctx.context()).request;
    else {
      api = await request.newContext();
      dispose = true;
    }
    try {
      const body =
        p.body === undefined
          ? {}
          : p.bodyType === 'form'
            ? {
                form: Object.fromEntries(
                  Object.entries(p.body as Record<string, unknown>).map(([k, v]) => [
                    k,
                    stringify(v),
                  ]),
                ),
              }
            : p.bodyType === 'text'
              ? { data: stringify(p.body) }
              : { data: p.body };
      ctx.log(`${p.method} ${url}`);
      const res = await api.fetch(url, {
        method: p.method,
        headers: p.headers,
        timeout: left(ctx),
        ...body,
      });
      const raw = await res.text();
      let parsed: unknown = raw;
      try {
        parsed = raw ? JSON.parse(raw) : '';
      } catch {
        // not JSON: keep text
      }
      const response = { status: res.status(), ok: res.ok(), headers: res.headers(), body: parsed };
      if (p.saveTo) ctx.vars.set(p.saveTo, response);
      ctx.log(`→ ${res.status()}`);

      const okStatus =
        p.expectStatus === undefined
          ? undefined
          : Array.isArray(p.expectStatus)
            ? p.expectStatus
            : [p.expectStatus];
      if (okStatus && !okStatus.includes(res.status())) {
        throw new EngineError(
          'ASSERTION_FAILED',
          `Step ${ctx.stepNo}: expected status ${okStatus.join('/')} but got ${res.status()}`,
          {
            check: 'status',
            op: 'equals',
            expected: okStatus.join('/'),
            actual: String(res.status()),
          },
        );
      }
      for (const f of p.expectFields) {
        const actual = readPath(parsed, f.path);
        if (!compareText(actual, f.op, f.value, f)) {
          throw new EngineError(
            'ASSERTION_FAILED',
            `Step ${ctx.stepNo}: ${f.path} expected ${f.op} "${stringify(f.value)}" but got "${stringify(actual)}"`,
            {
              check: 'apiField',
              path: f.path,
              op: f.op,
              expected: stringify(f.value),
              actual: stringify(actual),
            },
          );
        }
      }
    } catch (err) {
      if (err instanceof EngineError) throw err;
      throw new EngineError('API_ERROR', `Step ${ctx.stepNo}: ${p.method} ${url} failed`, {
        url,
        reason: err instanceof Error ? err.message.split('\n')[0] : String(err),
      });
    } finally {
      if (dispose) await api.dispose();
    }
  },
});

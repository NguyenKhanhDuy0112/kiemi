import type { BrowserContext, Page } from 'playwright-core';
import { z } from 'zod';
import { sleep } from '../assertions/actions';
import { compareText, TextMatchOptions, TextOpSchema } from '../assertions/compare';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { stringify } from '../vars/evaluate';
import { text } from './_common';
import { readPath } from './api';

/** Network profiles: latency (ms) and throughput (bytes/s) [Y-02]. */
const PROFILES = {
  slow3g: { latency: 400, down: (400 * 1024) / 8, up: (400 * 1024) / 8 },
  fast3g: { latency: 150, down: (1600 * 1024) / 8, up: (750 * 1024) / 8 },
} as const;

async function throttle(page: Page, profile: { latency: number; down: number; up: number } | null) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile?.latency ?? 0,
    downloadThroughput: profile?.down ?? -1,
    uploadThroughput: profile?.up ?? -1,
  });
}

/**
 * Network conditions of this session [Y-02]: `offline`, `online` again, or a
 * slow connection (`slow3g`, `fast3g`; `normal` removes the limit).
 */
export const networkAction = defineAction({
  type: 'network',
  params: z.object({ mode: z.enum(['offline', 'online', 'slow3g', 'fast3g', 'normal']) }),
  ui: { label: 'actions.network', icon: 'wifi-off', group: 'flow' },
  async execute({ mode }, ctx) {
    const context = await ctx.context();
    if (mode === 'offline') {
      await context.setOffline(true);
      return;
    }
    await context.setOffline(false);
    if (mode === 'online') return;
    const page = await ctx.page();
    await throttle(page, mode === 'normal' ? null : PROFILES[mode]);
  },
});

const PERMISSIONS = [
  'geolocation',
  'notifications',
  'camera',
  'microphone',
  'clipboard-read',
  'clipboard-write',
] as const;

/** Playwright's `camera`/`microphone` are `video`/`audio` capture for CDP. */
const CDP_NAME: Record<string, string> = {
  camera: 'videoCapture',
  microphone: 'audioCapture',
  'clipboard-read': 'clipboardReadWrite',
  'clipboard-write': 'clipboardSanitizedWrite',
};

async function origin(page: Page): Promise<string | undefined> {
  try {
    const o = new URL(page.url()).origin;
    return o === 'null' ? undefined : o;
  } catch {
    return undefined;
  }
}

async function setPermission(
  context: BrowserContext,
  page: Page,
  names: readonly string[],
  setting: 'granted' | 'denied' | 'prompt',
) {
  const browser = context.browser();
  if (!browser)
    throw new EngineError('INVALID_PARAMS', 'Browser permissions need a launched browser');
  const cdp = await browser.newBrowserCDPSession();
  const o = await origin(page);
  for (const n of names) {
    await cdp.send('Browser.setPermission', {
      permission: { name: CDP_NAME[n] ?? n },
      setting,
      ...(o ? { origin: o } : {}),
      browserContextId: undefined,
    } as never);
  }
}

/** Grants, denies or resets browser permissions for the page's site [Y-03]. */
export const permissionAction = defineAction({
  type: 'permission',
  params: z.object({
    op: z.enum(['grant', 'deny', 'reset']).default('grant'),
    permissions: z.array(z.enum(PERMISSIONS)).min(1),
    /** Position used when `geolocation` is granted. */
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  }),
  ui: { label: 'actions.permission', icon: 'shield-check', group: 'flow' },
  async execute({ op, permissions, latitude, longitude }, ctx) {
    const context = await ctx.context();
    const page = await ctx.page();
    if (op === 'grant') {
      const o = await origin(page);
      await context.grantPermissions([...permissions], o ? { origin: o } : {});
      if (latitude !== undefined && longitude !== undefined)
        await context.setGeolocation({ latitude, longitude });
      return;
    }
    if (op === 'reset') {
      await context.clearPermissions();
      return;
    }
    await setPermission(context, page, permissions, 'denied');
  },
});

/** Clipboard of the page: fill it, check what was copied, or paste [Y-04]. */
export const clipboardAction = defineAction({
  type: 'clipboard',
  params: z.object({
    op: z.enum(['write', 'assert', 'paste']).default('assert'),
    value: text.optional(),
    match: TextOpSchema.default('equals'),
    ...TextMatchOptions,
  }),
  ui: { label: 'actions.clipboard', icon: 'clipboard', group: 'flow' },
  async execute({ op, value, match, ignoreCase, normalizeSpace }, ctx) {
    const context = await ctx.context();
    const page = await ctx.page();
    const o = await origin(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], o ? { origin: o } : {});
    if (op === 'paste') {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
      return;
    }
    if (op === 'write') {
      await page.evaluate((v) => navigator.clipboard.writeText(v), value ?? '');
      return;
    }
    let seen = '';
    for (;;) {
      seen = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      if (compareText(seen, match, value, { ignoreCase, normalizeSpace })) return;
      if (ctx.remainingMs() < 400) break;
      await sleep(200, ctx.signal);
    }
    throw new EngineError(
      'ASSERTION_FAILED',
      `Step ${ctx.stepNo}: expected clipboard ${match} "${stringify(value)}" but got "${seen}"`,
      { check: 'clipboard', op: match, expected: stringify(value), actual: seen },
    );
  },
});

/**
 * Checks that the page sent a request [Y-05]: URL contains/matches, method, text
 * in the body, and JSON body fields (`order.total` = 99000). `exists: false`
 * checks that none was sent.
 */
export const assertRequestAction = defineAction({
  type: 'assertRequest',
  params: z.object({
    url: text,
    urlOp: z.enum(['contains', 'equals', 'regex']).default('contains'),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
    bodyContains: text.optional(),
    fields: z
      .array(z.object({ path: z.string().min(1), value: z.unknown().optional() }))
      .default([]),
    exists: z.boolean().default(true),
    /** Only requests sent since this step started (default: since the run began). */
    sinceStep: z.boolean().default(false),
  }),
  ui: { label: 'actions.assertRequest', icon: 'radio-tower', group: 'assert' },
  async execute(p, ctx) {
    const started = Date.now();
    const matches = () =>
      ctx.run.requests.filter((r) => {
        if (p.sinceStep && r.at < started) return false;
        if (p.method && r.method !== p.method) return false;
        if (
          p.urlOp === 'contains'
            ? !r.url.includes(p.url)
            : p.urlOp === 'equals'
              ? r.url !== p.url
              : !safeRegex(p.url).test(r.url)
        )
          return false;
        if (p.bodyContains !== undefined && !r.body.includes(p.bodyContains)) return false;
        if (p.fields.length) {
          let json: unknown;
          try {
            json = JSON.parse(r.body);
          } catch {
            return false;
          }
          return p.fields.every((f) => {
            const got = readPath(json, f.path);
            return f.value === undefined
              ? got !== undefined
              : stringify(got) === stringify(f.value);
          });
        }
        return true;
      });
    for (;;) {
      const found = matches();
      if (p.exists ? found.length > 0 : false) return;
      if (!p.exists && ctx.remainingMs() < 400) {
        if (found.length === 0) return;
        break;
      }
      if (p.exists && ctx.remainingMs() < 400) break;
      await sleep(200, ctx.signal);
    }
    const seen = ctx.run.requests.slice(-8).map((r) => `${r.method} ${r.url}`);
    throw new EngineError(
      'ASSERTION_FAILED',
      p.exists
        ? `Step ${ctx.stepNo}: no request matched ${p.method ?? ''} ${p.url}`
        : `Step ${ctx.stepNo}: a request ${p.url} was sent but should not have been`,
      {
        check: 'request',
        op: p.exists ? 'sent' : 'notSent',
        expected: p.url,
        actual: seen.join('\n'),
      },
    );
  },
});

function safeRegex(src: string): RegExp {
  try {
    return new RegExp(src, 'u');
  } catch {
    throw new EngineError('INVALID_PARAMS', `"${src}" is not a valid pattern`, { param: 'url' });
  }
}

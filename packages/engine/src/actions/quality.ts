import { z } from 'zod';
import { sleep } from '../assertions/actions';
import { compareNumber, extractNumber } from '../assertions/compare';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { stringify } from '../vars/evaluate';
import { target, text } from './_common';

function problems(stepNo: string, check: string, found: string[], extra = {}): never {
  throw new EngineError('ASSERTION_FAILED', `Step ${stepNo}: ${check}: ${found.join('; ')}`, {
    check,
    op: 'audit',
    expected: 'no problems',
    actual: found.join('\n'),
    problems: found,
    ...extra,
  });
}

/**
 * Response time [Q-05]: the nested steps must finish within `maxSeconds`
 * (fail) and should within `warnSeconds` (warning only). The time is shown in
 * the log either way.
 */
export const timedAction = defineAction({
  type: 'timed',
  params: z.object({
    maxSeconds: z.coerce.number().positive().max(600),
    warnSeconds: z.coerce.number().positive().max(600).optional(),
    steps: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
  ui: { label: 'actions.timed', icon: 'gauge', group: 'assert' },
  rawParams: ['steps'],
  container: true,
  async execute({ maxSeconds, warnSeconds, steps }, ctx) {
    const started = performance.now();
    await ctx.runSteps(steps);
    const sec = (performance.now() - started) / 1000;
    ctx.log(`Took ${sec.toFixed(2)} s`);
    if (sec > maxSeconds) {
      throw new EngineError(
        'ASSERTION_FAILED',
        `Step ${ctx.stepNo}: took ${sec.toFixed(2)} s, more than the allowed ${maxSeconds} s`,
        {
          check: 'duration',
          op: 'lte',
          expected: `${maxSeconds} s`,
          actual: `${sec.toFixed(2)} s`,
        },
      );
    }
    if (warnSeconds !== undefined && sec > warnSeconds)
      ctx.log(`Slow: ${sec.toFixed(2)} s (should be ≤ ${warnSeconds} s)`, 'warn');
  },
});

const layer = z.unknown().optional();

/**
 * UI = API = DB in one step [Q-07]: give the value each layer shows (from earlier
 * `extract`, `api` and `queryDb` steps, e.g. `{{giaUi}}`); the failure says which
 * layer disagrees with the others.
 */
export const assertLayersAction = defineAction({
  type: 'assertLayers',
  params: z
    .object({
      ui: layer,
      api: layer,
      db: layer,
      as: z.enum(['text', 'number']).default('text'),
      tolerance: z.unknown().optional(),
    })
    .refine(
      (p) => [p.ui, p.api, p.db].filter((v) => v !== undefined && v !== '').length >= 2,
      'give at least two layers',
    ),
  ui: { label: 'actions.assertLayers', icon: 'layers', group: 'assert' },
  execute(p, ctx) {
    const given = (['ui', 'api', 'db'] as const)
      .filter((k) => p[k] !== undefined && p[k] !== '')
      .map((k) => ({ k, v: p[k] }));
    const tol = p.tolerance === undefined ? undefined : extractNumber(p.tolerance);
    const same = (a: unknown, b: unknown) => {
      if (p.as === 'number') {
        const x = extractNumber(a);
        const y = extractNumber(b);
        return (
          x !== undefined &&
          y !== undefined &&
          compareNumber(x, 'eq', y, undefined, { absolute: tol, percent: undefined })
        );
      }
      return stringify(a).trim() === stringify(b).trim();
    };
    // Group layers that agree; the odd one out is named.
    const groups: { v: unknown; names: string[] }[] = [];
    for (const g of given) {
      const hit = groups.find((x) => same(x.v, g.v));
      if (hit) hit.names.push(g.k);
      else groups.push({ v: g.v, names: [g.k] });
    }
    if (groups.length === 1) return;
    const biggest = Math.max(...groups.map((g) => g.names.length));
    const odd =
      groups.filter((g) => g.names.length === biggest).length === 1
        ? groups.filter((g) => g.names.length < biggest).flatMap((g) => g.names)
        : given.map((g) => g.k);
    const shown = given.map((g) => `${g.k} = "${stringify(g.v)}"`).join(', ');
    throw new EngineError(
      'ASSERTION_FAILED',
      `Step ${ctx.stepNo}: the layers disagree (${shown}); differs: ${odd.join(', ')}`,
      {
        check: 'layers',
        op: 'equals',
        expected: stringify(groups.find((g) => g.names.length === biggest)?.v),
        actual: shown,
        layers: Object.fromEntries(given.map((g) => [g.k, stringify(g.v)])),
        differs: odd,
      },
    );
  },
});

/**
 * Quick repeated clicks [Q-08] (a double-click on "Save", an impatient user):
 * clicks `times` times in a row without waiting for the page, then optionally
 * checks how many records exist (`expectCount`), so duplicates show up.
 */
export const rapidClickAction = defineAction({
  type: 'rapidClick',
  params: z.object({
    target,
    times: z.coerce.number().int().min(2).max(50).default(3),
    delayMs: z.coerce.number().int().min(0).max(2000).default(0),
    expectCount: z.object({ target, count: z.coerce.number().int().min(0) }).optional(),
  }),
  ui: { label: 'actions.rapidClick', icon: 'mouse-pointer-click', group: 'input' },
  async execute({ target: t, times, delayMs, expectCount }, ctx) {
    const { locator } = await ctx.resolve(t);
    let done = 0;
    for (let i = 0; i < times; i++) {
      // A button that disables itself after the first click is the good outcome: later clicks just do not land.
      const ok = await locator
        .click({ force: true, timeout: 800, noWaitAfter: true })
        .then(() => true)
        .catch(() => false);
      if (ok) done++;
      if (delayMs) await sleep(delayMs, ctx.signal);
    }
    ctx.log(`${done} of ${times} clicks landed`);
    if (!expectCount) return;
    // Late responses may still add a duplicate: let the page settle before counting.
    await sleep(Math.min(800, Math.max(0, ctx.remainingMs() - 500)), ctx.signal);
    const page = await ctx.page();
    const css = cssOf(expectCount.target);
    let last = await page.locator(css).count();
    while (last !== expectCount.count && ctx.remainingMs() > 400) {
      await sleep(200, ctx.signal);
      last = await page.locator(css).count();
    }
    if (last === expectCount.count) return;
    throw new EngineError(
      'ASSERTION_FAILED',
      `Step ${ctx.stepNo}: after ${times} quick clicks there are ${last} record(s), expected ${expectCount.count}`,
      {
        check: 'duplicates',
        op: 'equals',
        expected: String(expectCount.count),
        actual: String(last),
      },
    );
  },
});

function cssOf(t: unknown): string {
  const css = (t as { css?: string }).css;
  if (!css)
    throw new EngineError('INVALID_PARAMS', 'expectCount.target needs a CSS selector', {
      param: 'expectCount',
    });
  return css;
}

/**
 * Buttons by state [Q-10]: which must be visible/enabled/disabled/absent. One
 * step per status of a record ("Đã duyệt" → no Edit button); use a data table to
 * walk the whole state table.
 */
export const assertButtonsAction = defineAction({
  type: 'assertButtons',
  params: z.object({
    enabled: z.array(target).default([]),
    disabled: z.array(target).default([]),
    hidden: z.array(target).default([]),
    /** Said in the report: which status of the record this is. */
    status: text.optional(),
  }),
  ui: { label: 'actions.assertButtons', icon: 'toggle-right', group: 'assert' },
  async execute({ enabled, disabled, hidden, status }, ctx) {
    const out: string[] = [];
    const name = (t: unknown) => JSON.stringify(t).slice(0, 60);
    const probe = async (t: (typeof enabled)[number]) => {
      try {
        const { locator } = await ctx.resolve(t, { state: 'attached', timeoutMs: 0 });
        const info = await locator.evaluate((el) => {
          const h = el as HTMLButtonElement;
          const s = getComputedStyle(el);
          return {
            shown:
              s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0,
            disabled: h.disabled === true || el.getAttribute('aria-disabled') === 'true',
          };
        });
        return info;
      } catch {
        return null;
      }
    };
    // The page may still be updating: retry the whole check until time runs low.
    for (;;) {
      out.length = 0;
      for (const t of enabled) {
        const i = await probe(t);
        if (!i?.shown) out.push(`${name(t)} should be enabled but is missing`);
        else if (i.disabled) out.push(`${name(t)} should be enabled but is disabled`);
      }
      for (const t of disabled) {
        const i = await probe(t);
        if (!i?.shown) out.push(`${name(t)} should be disabled but is missing`);
        else if (!i.disabled) out.push(`${name(t)} should be disabled but is enabled`);
      }
      for (const t of hidden) {
        const i = await probe(t);
        if (i?.shown) out.push(`${name(t)} should not be there but is shown`);
      }
      if (out.length === 0) return;
      if (ctx.remainingMs() < 400) break;
      await sleep(200, ctx.signal);
    }
    problems(ctx.stepNo, status ? `buttons for status "${status}"` : 'buttons', out);
  },
});

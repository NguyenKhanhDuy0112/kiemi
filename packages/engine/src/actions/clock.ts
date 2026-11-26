import type { BrowserContext } from 'playwright-core';
import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { parseDate } from '../vars/dates';
import { text } from './_common';

/** Contexts whose clock is already faked (install is allowed once). */
const installed = new WeakSet<BrowserContext>();
/** Time a frozen context shows, to let `resume` flow from there. */
const frozenAt = new WeakMap<BrowserContext, Date>();

const UNIT_MS = { seconds: 1000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;

function readTime(value: string | undefined): Date {
  if (value === undefined || value === '') {
    throw new EngineError('INVALID_PARAMS', 'A date/time is required', { param: 'time' });
  }
  const d = parseDate(value);
  if (!d) {
    throw new EngineError('INVALID_PARAMS', `Cannot read "${value}" as a date and time`, {
      param: 'time',
      value,
    });
  }
  return d;
}

/**
 * Fake the browser's clock for this session [Y-01]: `set` a date/time (time keeps
 * running from there), `freeze` it, `advance` quickly, or `resume` after a freeze.
 * It applies to every tab of the session, current and future.
 */
export const clockAction = defineAction({
  type: 'clock',
  params: z.object({
    op: z.enum(['set', 'freeze', 'advance', 'resume']).default('set'),
    /** `dd/MM/yyyy`, `dd/MM/yyyy HH:mm`, or ISO. */
    time: text.optional(),
    amount: z.coerce.number().positive().optional(),
    unit: z.enum(['seconds', 'minutes', 'hours', 'days']).default('seconds'),
  }),
  ui: { label: 'actions.clock', icon: 'clock', group: 'flow' },
  async execute({ op, time, amount, unit }, ctx) {
    await ctx.page();
    const context = await ctx.context();
    const clock = context.clock;
    const ensure = async (at: Date) => {
      if (installed.has(context)) return false;
      await clock.install({ time: at });
      installed.add(context);
      return true;
    };
    switch (op) {
      case 'set': {
        const at = readTime(time);
        frozenAt.delete(context);
        if (!(await ensure(at))) await clock.setSystemTime(at);
        ctx.log(`Clock set to ${at.toISOString()}`);
        return;
      }
      case 'freeze': {
        const at = time ? readTime(time) : new Date();
        await ensure(at);
        await clock.setFixedTime(at);
        frozenAt.set(context, at);
        ctx.log(`Clock frozen at ${at.toISOString()}`);
        return;
      }
      case 'resume': {
        const at = frozenAt.get(context);
        if (!at) return;
        frozenAt.delete(context);
        await clock.setSystemTime(at);
        ctx.log('Clock runs again');
        return;
      }
      case 'advance': {
        if (amount === undefined) {
          throw new EngineError('INVALID_PARAMS', 'amount is required to advance the clock', {
            param: 'amount',
          });
        }
        await ensure(new Date());
        const ms = amount * UNIT_MS[unit];
        const base = frozenAt.get(context);
        if (base) {
          // Frozen: move the frozen time itself.
          const next = new Date(base.getTime() + ms);
          await clock.setFixedTime(next);
          frozenAt.set(context, next);
        } else {
          await clock.fastForward(ms);
        }
        ctx.log(`Clock advanced ${amount} ${unit}`);
        return;
      }
    }
  },
});

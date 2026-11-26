import { format } from 'date-fns';
import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { parseDate } from '../vars/dates';
import { left, target, text } from './_common';

/**
 * Pick a date [A-08] by typing it: `<input type="date">` gets ISO format, other
 * fields (custom pickers) get `format` (default dd/MM/yyyy).
 */
export const pickDateAction = defineAction({
  type: 'pickDate',
  params: z.object({ target, value: text, format: z.string().default('dd/MM/yyyy') }),
  ui: { label: 'actions.pickDate', icon: 'calendar', group: 'input' },
  async execute({ target: t, value, format: pattern }, ctx) {
    const date = parseDate(value);
    if (!date) throw new EngineError('INVALID_PARAMS', `"${value}" is not a date`, { value });
    const { locator } = await ctx.resolve(t);
    const type = await locator.evaluate((el) => (el instanceof HTMLInputElement ? el.type : ''));
    const typed =
      type === 'date'
        ? format(date, 'yyyy-MM-dd')
        : type === 'datetime-local'
          ? format(date, "yyyy-MM-dd'T'HH:mm")
          : type === 'month'
            ? format(date, 'yyyy-MM')
            : format(date, pattern);
    await locator.fill(typed, { timeout: left(ctx) });
    // Close a picker popup that typing may have opened.
    await locator.press('Tab', { timeout: left(ctx) }).catch(() => undefined);
  },
});

/**
 * Pick a date range [W-04]: one box that takes `from – to` (date-range pickers), or
 * two boxes with `targetEnd`. Types the dates, confirms with Enter, then clicks
 * `apply` when the picker has an "Apply" button.
 */
export const pickDateRangeAction = defineAction({
  type: 'pickDateRange',
  params: z.object({
    target,
    /** Second box, when the range has one box per date. */
    targetEnd: target.optional(),
    from: text,
    to: text,
    format: z.string().default('dd/MM/yyyy'),
    /** Between the dates in a single box. */
    separator: z.string().default(' - '),
    /** "Apply" button of the picker. */
    apply: target.optional(),
  }),
  ui: { label: 'actions.pickDateRange', icon: 'calendar-range', group: 'input' },
  async execute(p, ctx) {
    const start = parseDate(p.from);
    const end = parseDate(p.to);
    if (!start || !end) {
      throw new EngineError('INVALID_PARAMS', `"${start ? p.to : p.from}" is not a date`, {
        value: start ? p.to : p.from,
      });
    }
    if (start.getTime() > end.getTime()) {
      throw new EngineError('INVALID_PARAMS', 'The start date is after the end date', {
        from: p.from,
        to: p.to,
      });
    }
    const a = format(start, p.format);
    const b = format(end, p.format);
    const { locator } = await ctx.resolve(p.target);
    if (p.targetEnd) {
      await locator.fill(a, { timeout: left(ctx) });
      const second = await ctx.resolve(p.targetEnd);
      await second.locator.fill(b, { timeout: left(ctx) });
      await second.locator.press('Enter', { timeout: left(ctx) });
    } else {
      await locator.fill(`${a}${p.separator}${b}`, { timeout: left(ctx) });
      await locator.press('Enter', { timeout: left(ctx) });
    }
    if (p.apply) {
      const button = await ctx.resolve(p.apply);
      await button.locator.click({ timeout: left(ctx) });
    }
  },
});

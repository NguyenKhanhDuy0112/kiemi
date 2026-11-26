import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { z } from 'zod';
import { parseDate } from '../vars/dates';
import { stringify, toNumber } from '../vars/evaluate';
import type { Locale } from '../vars/values';

/** Text comparisons [B-03]. */
export const TEXT_OPS = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'regex',
  'empty',
  'notEmpty',
] as const;
export const TextOpSchema = z.enum(TEXT_OPS);
export type TextOp = z.infer<typeof TextOpSchema>;

export const TextMatchOptions = {
  ignoreCase: z.boolean().default(false),
  /** Collapse spaces/new lines and trim before comparing (default on). */
  normalizeSpace: z.boolean().default(true),
};

export function normalizeText(
  s: string,
  o: { ignoreCase: boolean; normalizeSpace: boolean },
): string {
  let out = s;
  if (o.normalizeSpace) out = out.replace(/[\s ]+/g, ' ').trim();
  if (o.ignoreCase) out = out.toLocaleLowerCase('vi');
  return out;
}

export function compareText(
  actualRaw: unknown,
  op: TextOp,
  expectedRaw: unknown,
  o: { ignoreCase: boolean; normalizeSpace: boolean },
): boolean {
  const actual = normalizeText(stringify(actualRaw), o);
  if (op === 'empty') return actual === '';
  if (op === 'notEmpty') return actual !== '';
  if (op === 'regex') {
    try {
      return new RegExp(stringify(expectedRaw), o.ignoreCase ? 'iu' : 'u').test(
        stringify(actualRaw),
      );
    } catch {
      return false;
    }
  }
  const expected = normalizeText(stringify(expectedRaw), o);
  switch (op) {
    case 'equals':
      return actual === expected;
    case 'notEquals':
      return actual !== expected;
    case 'contains':
      return actual.includes(expected);
    case 'notContains':
      return !actual.includes(expected);
    case 'startsWith':
      return actual.startsWith(expected);
    case 'endsWith':
      return actual.endsWith(expected);
  }
}

/** Number comparisons [B-05]. */
export const NUMBER_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'] as const;
export const NumberOpSchema = z.enum(NUMBER_OPS);
export type NumberOp = z.infer<typeof NumberOpSchema>;

/** First number in a text such as "Tổng: 1.250.000 đ" → 1250000. */
export function extractNumber(v: unknown, locale: Locale = 'vi'): number | undefined {
  const direct = toNumber(v, locale);
  if (direct !== undefined) return direct;
  const m = stringify(v).match(/[-+]?\d[\d.,\s ]*\d|[-+]?\d/);
  return m ? toNumber(m[0].replace(/[\s ]/g, ''), locale) : undefined;
}

/** Allowed gap for `eq` / `ne`: absolute and/or a percentage of the expected value [P-04]. */
export interface Tolerance {
  absolute?: number | undefined;
  percent?: number | undefined;
}

/** The larger of the absolute and the percentage allowance. */
export function allowance(expected: number, t: Tolerance | undefined): number {
  const abs = t?.absolute === undefined ? 0 : Math.abs(t.absolute);
  const pct = t?.percent === undefined ? 0 : (Math.abs(expected) * Math.abs(t.percent)) / 100;
  return Math.max(abs, pct);
}

export function compareNumber(
  actual: number,
  op: NumberOp,
  a: number,
  b?: number,
  tolerance?: Tolerance,
): boolean {
  const slack = allowance(a, tolerance);
  const eps = 1e-9;
  switch (op) {
    case 'eq':
      return Math.abs(actual - a) <= eps + slack;
    case 'ne':
      return Math.abs(actual - a) > eps + slack;
    case 'gt':
      return actual > a;
    case 'gte':
      return actual >= a - eps;
    case 'lt':
      return actual < a;
    case 'lte':
      return actual <= a + eps;
    case 'between':
      return actual >= Math.min(a, b ?? a) - eps && actual <= Math.max(a, b ?? a) + eps;
  }
}

/** Date comparisons by calendar day [B-06]. */
export const DATE_OPS = ['equals', 'before', 'after', 'todayPlus'] as const;
export const DateOpSchema = z.enum(DATE_OPS);
export type DateOp = z.infer<typeof DateOpSchema>;

export function extractDate(v: unknown, format?: string): Date | undefined {
  const text = stringify(v);
  const direct = parseDate(text, format);
  if (direct) return direct;
  const m = text.match(/\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/);
  return m ? parseDate(m[0], format) : undefined;
}

export function compareDate(
  actual: Date,
  op: DateOp,
  expected: Date | undefined,
  days: number,
  now: Date,
): boolean {
  if (op === 'todayPlus')
    return differenceInCalendarDays(startOfDay(actual), startOfDay(now)) === days;
  if (!expected) return false;
  const diff = differenceInCalendarDays(actual, expected);
  return op === 'equals' ? diff === 0 : op === 'before' ? diff < 0 : diff > 0;
}

/** Count comparisons [B-07]. */
export const CountOpSchema = z.enum(['eq', 'gte', 'lte']);

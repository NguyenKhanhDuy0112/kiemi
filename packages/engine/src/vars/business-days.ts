import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInYears,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  isValid,
  startOfDay,
} from 'date-fns';
import { EngineError } from '../errors';
import { parseDate } from './dates';
import { stringify } from './values';

/**
 * Business-day and calendar functions [P-07]. Working days are Monday–Friday
 * minus holidays. Holidays are the fixed Vietnamese ones (1/1, 30/4, 1/5, 2/9)
 * plus any the tester lists: a variable `holidays` ("09/04/2026; 10/04/2026")
 * or a last argument (WORKDAYS(a, b, '09/04/2026')). Tết and Hùng Vương move
 * every year, so they must be listed.
 */

/** `holidays` = the project's `holidays` variable (may be empty). */
type Fn = (args: unknown[], ctx: { now: Date; holidays: string }) => unknown;

const FIXED = ['01-01', '04-30', '05-01', '09-02'];

function toDate(v: unknown, fn: string): Date {
  const d = v instanceof Date ? v : parseDate(stringify(v));
  if (!d || !isValid(d))
    throw new EngineError('INVALID_EXPRESSION', `${fn}: "${stringify(v)}" is not a date`, {
      function: fn,
      value: stringify(v),
    });
  return startOfDay(d);
}

function holidaySet(extra: unknown, fn: string): Set<string> {
  const set = new Set<string>();
  for (const part of stringify(extra ?? '').split(/[;,\n]/)) {
    const t = part.trim();
    if (!t) continue;
    set.add(format(toDate(t, fn), 'yyyy-MM-dd'));
  }
  return set;
}

export function isWorkday(d: Date, extra: Set<string>): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  const key = format(d, 'yyyy-MM-dd');
  return !(FIXED.includes(key.slice(5)) || extra.has(key));
}

/** Last argument may be a list of holidays (a text that is not a single date). */
function split(args: unknown[], fixed: number): { main: unknown[]; extra: unknown } {
  const main = args.slice(0, fixed);
  return { main, extra: args[fixed] };
}

export const BUSINESS_FUNCTIONS: Record<string, Fn> = {
  /** WORKDAYS(from, to[, holidays]): working days from..to, both included. */
  workdays: (args, { holidays: hv }) => {
    const { main, extra } = split(args, 2);
    const a = toDate(main[0], 'WORKDAYS');
    const b = toDate(main[1], 'WORKDAYS');
    const hol = holidaySet(extra ?? hv, 'WORKDAYS');
    const [from, to, sign] = a <= b ? [a, b, 1] : [b, a, -1];
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d, hol)) n++;
    return n * sign;
  },
  /** WORKDAY(date, n[, holidays]): the date n working days after (before when n < 0). */
  workday: (args, { holidays: hv }) => {
    const { main, extra } = split(args, 2);
    let d = toDate(main[0], 'WORKDAY');
    let left = Math.trunc(Number(stringify(main[1])));
    if (!Number.isFinite(left))
      throw new EngineError('INVALID_EXPRESSION', 'WORKDAY: n must be a number', {
        function: 'WORKDAY',
      });
    const hol = holidaySet(extra ?? hv, 'WORKDAY');
    const step = left < 0 ? -1 : 1;
    left = Math.abs(left);
    while (left > 0) {
      d = addDays(d, step);
      if (isWorkday(d, hol)) left--;
    }
    return d;
  },
  isworkday: (args, { holidays: hv }) => {
    const { main, extra } = split(args, 1);
    return isWorkday(toDate(main[0], 'ISWORKDAY'), holidaySet(extra ?? hv, 'ISWORKDAY'));
  },
  endofmonth: ([d]) => startOfDay(endOfMonth(toDate(d, 'ENDOFMONTH'))),
  endofquarter: ([d]) => startOfDay(endOfQuarter(toDate(d, 'ENDOFQUARTER'))),
  endofyear: ([d]) => startOfDay(endOfYear(toDate(d, 'ENDOFYEAR'))),
  /** DAYSBETWEEN(a, b) = b − a in days. */
  daysbetween: ([a, b]) =>
    differenceInCalendarDays(toDate(b, 'DAYSBETWEEN'), toDate(a, 'DAYSBETWEEN')),
  /** MONTHSBETWEEN(a, b) = whole calendar months from a to b. */
  monthsbetween: ([a, b]) =>
    differenceInCalendarMonths(toDate(b, 'MONTHSBETWEEN'), toDate(a, 'MONTHSBETWEEN')),
  /** AGE(birth[, on]) in whole years. */
  age: ([birth, on], c) =>
    differenceInYears(
      on === undefined ? startOfDay(c.now) : toDate(on, 'AGE'),
      toDate(birth, 'AGE'),
    ),
  /** SENIORITY(start[, on]) in whole years of service. */
  seniority: ([start, on], c) =>
    differenceInYears(
      on === undefined ? startOfDay(c.now) : toDate(on, 'SENIORITY'),
      toDate(start, 'SENIORITY'),
    ),
  /** SENIORITYMONTHS(start[, on]) in whole months of service. */
  senioritymonths: ([start, on], c) => {
    const s = toDate(start, 'SENIORITYMONTHS');
    const e = on === undefined ? startOfDay(c.now) : toDate(on, 'SENIORITYMONTHS');
    const months = differenceInCalendarMonths(e, s);
    return e.getDate() < s.getDate() ? months - 1 : months;
  },
};

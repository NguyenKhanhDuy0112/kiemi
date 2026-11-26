import { EngineError } from '../errors';
import { matchesCriteria, stringify, toNumber } from './values';

/**
 * Spreadsheet-like function library [P-03]: aggregates over numbers or over a
 * list of objects (`SUM(gioHang, 'thanhTien')`), conditional aggregates and
 * rounding (negative digits round tens/hundreds). Names are case-insensitive.
 */

type Fn = (args: unknown[]) => unknown;

function bad(message: string, details: Record<string, unknown>): EngineError {
  return new EngineError('INVALID_EXPRESSION', message, details);
}

const isObjectList = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));

/** Reads a field of every item; `field` must exist on the first item. */
function pluck(list: Record<string, unknown>[], field: unknown, fn: string): unknown[] {
  const f = stringify(field);
  if (list.length > 0 && !list.some((r) => Object.hasOwn(r, f))) {
    throw bad(`${fn}: no column "${f}" in the list`, {
      function: fn,
      column: f,
      columns: Object.keys(list[0] ?? {}),
    });
  }
  return list.map((r) => r[f]);
}

/** Flattens arguments to numbers: lists, `(list, 'column')`, or plain values. Blank cells are skipped. */
export function numbersOf(args: unknown[], fn: string): number[] {
  let values: unknown[];
  const [first, second] = args;
  if (isObjectList(first) && typeof second === 'string' && args.length === 2)
    values = pluck(first, second, fn);
  else values = args.flatMap((a) => (Array.isArray(a) ? a : [a]));
  const out: number[] = [];
  for (const v of values) {
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) continue;
    const n = toNumber(v);
    if (n === undefined)
      throw bad(`${fn}: "${stringify(v)}" is not a number`, { function: fn, value: stringify(v) });
    out.push(n);
  }
  return out;
}

function digits(d: unknown, fn: string): number {
  const n = d === undefined ? 0 : toNumber(d);
  if (n === undefined || !Number.isInteger(n))
    throw bad(`${fn}: digits must be a whole number`, { function: fn });
  return n;
}

/** Exact decimal shift: 1.005 → 100.5 without 100.49999… */
const shift = (x: number, by: number) => Number(`${x}e${by}`);

function round(mode: 'half' | 'up' | 'down', fn: string): Fn {
  return ([x, d]) => {
    const n = toNumber(x);
    if (n === undefined) throw bad(`${fn}: "${stringify(x)}" is not a number`, { function: fn });
    const k = digits(d, fn);
    const scaled = shift(Math.abs(n), k);
    const r =
      mode === 'half' ? Math.round(scaled) : mode === 'up' ? Math.ceil(scaled) : Math.floor(scaled);
    return Math.sign(n) * shift(r, -k);
  };
}

const listArg = (v: unknown, fn: string): Record<string, unknown>[] => {
  if (!isObjectList(v)) throw bad(`${fn}: first argument must be a list (table)`, { function: fn });
  return v;
};

export const SHEET_FUNCTIONS: Record<string, Fn> = {
  sum: (a) => numbersOf(a, 'SUM').reduce((x, y) => x + y, 0),
  avg: (a) => {
    const n = numbersOf(a, 'AVG');
    if (n.length === 0) throw bad('AVG: no numbers', { function: 'AVG' });
    return n.reduce((x, y) => x + y, 0) / n.length;
  },
  average: (a) => SHEET_FUNCTIONS.avg?.(a),
  count: (a) => {
    // A table without a column: number of rows.
    if (a.length === 1 && isObjectList(a[0])) return a[0].length;
    return numbersOf(a, 'COUNT').length;
  },
  min: (a) => {
    const n = numbersOf(a, 'MIN');
    if (n.length === 0) throw bad('MIN: no numbers', { function: 'MIN' });
    return Math.min(...n);
  },
  max: (a) => {
    const n = numbersOf(a, 'MAX');
    if (n.length === 0) throw bad('MAX: no numbers', { function: 'MAX' });
    return Math.max(...n);
  },
  /** FILTER(list, column, criteria) → rows whose column matches. */
  filter: ([list, column, criteria]) =>
    listArg(list, 'FILTER').filter((r) => matchesCriteria(r[stringify(column)], criteria)),
  /** COUNTIF(list, column, criteria) */
  countif: ([list, column, criteria]) =>
    listArg(list, 'COUNTIF').filter((r) => matchesCriteria(r[stringify(column)], criteria)).length,
  /** SUMIF(list, column, criteria, sumColumn) */
  sumif: ([list, column, criteria, sumColumn]) => {
    const rows = listArg(list, 'SUMIF').filter((r) =>
      matchesCriteria(r[stringify(column)], criteria),
    );
    return numbersOf([rows, sumColumn ?? column], 'SUMIF').reduce((x, y) => x + y, 0);
  },
  round: round('half', 'ROUND'),
  roundup: round('up', 'ROUNDUP'),
  rounddown: round('down', 'ROUNDDOWN'),
  and: (a) => a.every(truthy),
  or: (a) => a.some(truthy),
  not: ([x]) => !truthy(x),
};

export function truthy(v: unknown): boolean {
  if (typeof v === 'string') return !['', 'false', '0'].includes(v.trim().toLowerCase());
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

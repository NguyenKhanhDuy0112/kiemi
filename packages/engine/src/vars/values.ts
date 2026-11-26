import { AppValue } from './app';
import { formatDate } from './dates';

export type Locale = 'vi' | 'en';

/**
 * Reads `1.000.000`, `1,000.50`, `12,5`, `-3`, `1.250.000 ₫` as numbers [B-05, E-07, P-10].
 * A lone separator followed by exactly 3 digits is a thousands mark; otherwise it is the
 * decimal point — `,` in `vi` (default), `.` in `en`.
 */
export function toNumber(v: unknown, locale: Locale = 'vi'): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v !== 'string') return undefined;
  let s = v.trim().replace(/[\s ]|đ|₫|vnd|vnđ|%|\$/gi, '');
  if (!/^[-+]?[\d.,]+$/.test(s) || !/\d/.test(s)) return undefined;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  const thousands = /^\D?\d{1,3}[.,]\d{3}$/.test(s);
  if (dots && commas) {
    // The last separator is the decimal one.
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (dots > 1 || (dots === 1 && locale === 'vi' && thousands)) {
    s = s.replace(/\./g, ''); // 1.000.000 / 1.000 (VN thousands)
  } else if (commas > 1 || (commas === 1 && locale === 'en' && thousands)) {
    s = s.replace(/,/g, ''); // 1,000,000 / 1,000 (EN thousands)
  } else if (commas === 1 && locale === 'vi' && thousands) {
    s = s.replace(',', ''); // 1,000 (written the English way even in vi)
  } else if (commas === 1) {
    s = s.replace(',', '.'); // 12,5
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Converts a value to the text typed into the page. */
export function stringify(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (v instanceof AppValue) return v.url();
  if (v instanceof Date) return formatDate(v);
  if (typeof v === 'number') return String(Number(v.toFixed(10)));
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return JSON.stringify(v);
}

export type CompareOp = '=' | '<>' | '<' | '<=' | '>' | '>=';

/** Compares two values like a spreadsheet: numbers by value (`1.250.000 ₫` = `1250000`), else text ignoring case [P-03]. */
export function compareValues(a: unknown, op: CompareOp, b: unknown): boolean {
  const x = typeof a === 'string' && a.trim() === '' ? undefined : toNumber(a);
  const y = typeof b === 'string' && b.trim() === '' ? undefined : toNumber(b);
  let c: number;
  if (x !== undefined && y !== undefined) c = x === y ? 0 : x < y ? -1 : 1;
  else if (a instanceof Date && b instanceof Date) c = Math.sign(a.getTime() - b.getTime());
  else c = stringify(a).trim().localeCompare(stringify(b).trim(), 'vi', { sensitivity: 'accent' });
  switch (op) {
    case '=':
      return c === 0;
    case '<>':
      return c !== 0;
    case '<':
      return c < 0;
    case '<=':
      return c <= 0;
    case '>':
      return c > 0;
    case '>=':
      return c >= 0;
  }
}

/** Spreadsheet criteria: `">100"`, `"<>Hủy"`, `"Áo"` (equals) or any plain value [P-03]. */
export function matchesCriteria(value: unknown, criteria: unknown): boolean {
  if (typeof criteria === 'string') {
    const m = /^\s*(<>|>=|<=|=|>|<)\s*([\s\S]*)$/.exec(criteria);
    if (m) return compareValues(value, m[1] as CompareOp, (m[2] ?? '').trim());
  }
  return compareValues(value, '=', criteria);
}

/** Groups digits: `1.250.000` (vi, decimal `,`) or `1,250,000` (en, decimal `.`) [P-10]. */
export function formatNumber(n: number, locale: Locale = 'vi', decimals?: number): string {
  const fixed = decimals === undefined ? String(Number(n.toFixed(10))) : n.toFixed(decimals);
  const [int = '0', frac] = fixed.replace('-', '').split('.');
  const group = locale === 'vi' ? '.' : ',';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const sign = n < 0 ? '-' : '';
  return frac ? `${sign}${grouped}${locale === 'vi' ? ',' : '.'}${frac}` : `${sign}${grouped}`;
}

/** `1.250.000 ₫` (vi) / `₫1,250,000` (en) [P-10]. */
export function formatMoney(n: number, locale: Locale = 'vi'): string {
  const text = formatNumber(n, locale);
  return locale === 'vi' ? `${text} ₫` : `₫${text}`;
}

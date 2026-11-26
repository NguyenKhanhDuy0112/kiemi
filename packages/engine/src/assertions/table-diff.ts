import type { Locale } from '../vars/values';
import { stringify, toNumber } from '../vars/values';

export type Row = Record<string, unknown>;

export interface CellDiff {
  key: string;
  column: string;
  expected: string;
  actual: string;
}

export interface TableDiff {
  /** Keys expected but not in the table. */
  missing: string[];
  /** Keys in the table but not expected. */
  extra: string[];
  /** Cells that differ (rows matched by key, order ignored). */
  mismatched: CellDiff[];
  /** Keys that appear more than once on a side (cannot be matched safely). */
  duplicates: string[];
}

const norm = (s: string) =>
  s
    .replace(/[\s ]+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');

/** Same text, or the same number (`1.250.000 ₫` = `1250000`). */
export function sameCell(a: unknown, b: unknown, locale: Locale = 'vi'): boolean {
  const x = stringify(a);
  const y = stringify(b);
  if (norm(x) === norm(y)) return true;
  const nx = toNumber(x, locale);
  const ny = toNumber(y, locale);
  return nx !== undefined && ny !== undefined && Math.abs(nx - ny) < 1e-9;
}

/** Looks a column up ignoring case/spaces (`Mã SP` = `mã sp`). */
const cell = (row: Row, column: string): unknown => {
  if (Object.hasOwn(row, column)) return row[column];
  const k = Object.keys(row).find((x) => norm(x) === norm(column));
  return k === undefined ? undefined : row[k];
};

/**
 * Compares a table with the expected list by key, ignoring order [P-06]. Only
 * `columns` are compared (default: every column of the expected rows but the key).
 */
export function diffTables(
  actual: Row[],
  expected: Row[],
  key: string,
  columns?: string[],
  locale: Locale = 'vi',
): TableDiff {
  const cols =
    columns ??
    [...new Set(expected.flatMap((r) => Object.keys(r)))].filter((c) => norm(c) !== norm(key));
  const index = (rows: Row[]) => {
    const map = new Map<string, Row>();
    const dup = new Set<string>();
    for (const r of rows) {
      const k = norm(stringify(cell(r, key)));
      if (map.has(k)) dup.add(stringify(cell(r, key)));
      else map.set(k, r);
    }
    return { map, dup };
  };
  const a = index(actual);
  const e = index(expected);
  const diff: TableDiff = {
    missing: [],
    extra: [],
    mismatched: [],
    duplicates: [...new Set([...a.dup, ...e.dup])],
  };
  for (const [k, exp] of e.map) {
    const act = a.map.get(k);
    const label = stringify(cell(exp, key));
    if (!act) {
      diff.missing.push(label);
      continue;
    }
    for (const c of cols) {
      const ev = cell(exp, c);
      const av = cell(act, c);
      if (!sameCell(av, ev, locale))
        diff.mismatched.push({
          key: label,
          column: c,
          expected: stringify(ev),
          actual: stringify(av),
        });
    }
  }
  for (const [k, act] of a.map) if (!e.map.has(k)) diff.extra.push(stringify(cell(act, key)));
  return diff;
}

export const isClean = (d: TableDiff) =>
  d.missing.length === 0 && d.extra.length === 0 && d.mismatched.length === 0;

/** One-line summary for the failure message. */
export function describeDiff(d: TableDiff, max = 3): string {
  const part = (label: string, items: string[]) =>
    items.length
      ? `${label} ${items.length} (${items.slice(0, max).join(', ')}${items.length > max ? ', …' : ''})`
      : '';
  return [
    part('thiếu', d.missing),
    part('thừa', d.extra),
    part(
      'lệch',
      d.mismatched.map((m) => `${m.key}.${m.column}: ${m.actual} ≠ ${m.expected}`),
    ),
    d.duplicates.length ? `trùng khóa: ${d.duplicates.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ');
}

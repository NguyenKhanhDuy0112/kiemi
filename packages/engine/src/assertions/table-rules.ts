import { parseDate } from '../vars/dates';
import { type Locale, stringify, toNumber } from '../vars/values';
import {
  compareNumber,
  compareText,
  extractNumber,
  NUMBER_OPS,
  type NumberOp,
  TEXT_OPS,
  type TextOp,
} from './compare';

export type Row = Record<string, unknown>;

export const ROW_OPS = [...TEXT_OPS, ...NUMBER_OPS] as const;
export type RowOp = (typeof ROW_OPS)[number];

const norm = (s: string) =>
  s
    .replace(/[\s ]+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');

/** Cell of a row by column name, ignoring case and spacing. */
export function cellOf(row: Row, column: string): unknown {
  if (Object.hasOwn(row, column)) return row[column];
  const k = Object.keys(row).find((x) => norm(x) === norm(column));
  return k === undefined ? undefined : row[k];
}

export interface Violation {
  /** 1-based position among all rows read. */
  row: number;
  value: string;
}

/** Rows whose `column` does not satisfy `op value` [Q-01]. */
export function violations(
  rows: Row[],
  column: string,
  op: RowOp,
  value: unknown,
  max: unknown,
  locale: Locale = 'vi',
): Violation[] {
  const out: Violation[] = [];
  rows.forEach((r, i) => {
    const raw = cellOf(r, column);
    let pass: boolean;
    if ((NUMBER_OPS as readonly string[]).includes(op)) {
      const n = extractNumber(raw, locale);
      const a = extractNumber(value, locale);
      const b = max === undefined ? undefined : extractNumber(max, locale);
      pass = n !== undefined && a !== undefined && compareNumber(n, op as NumberOp, a, b);
    } else {
      pass = compareText(raw, op as TextOp, value, { ignoreCase: true, normalizeSpace: true });
    }
    if (!pass) out.push({ row: i + 1, value: stringify(raw) });
  });
  return out;
}

export type SortKind = 'auto' | 'number' | 'date' | 'text';

const collator = new Intl.Collator('vi', { sensitivity: 'variant', numeric: false });

/** A comparable key for each kind; `auto` picks number, else date, else text. */
function keyOf(raw: unknown, kind: SortKind, locale: Locale): number | string {
  const text = stringify(raw).trim();
  if (kind === 'number' || kind === 'auto') {
    const n = toNumber(text, locale);
    if (n !== undefined) return n;
    if (kind === 'number') return Number.NaN;
  }
  if (kind === 'date' || kind === 'auto') {
    const d = parseDate(text);
    if (d) return d.getTime();
    if (kind === 'date') return Number.NaN;
  }
  return text;
}

function order(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : a < b ? -1 : 1;
  return collator.compare(String(a), String(b)); // Vietnamese order: a < ă < â < b, d < đ
}

export interface SortProblem {
  /** 1-based position of the row that breaks the order. */
  row: number;
  previous: string;
  value: string;
}

/** First rows out of order (ascending or descending), `[]` when sorted [Q-02]. */
export function sortProblems(
  rows: Row[],
  column: string,
  direction: 'asc' | 'desc',
  kind: SortKind = 'auto',
  locale: Locale = 'vi',
  limit = 10,
): SortProblem[] {
  const out: SortProblem[] = [];
  let prev: { key: number | string; text: string } | undefined;
  rows.forEach((r, i) => {
    const raw = cellOf(r, column);
    const key = keyOf(raw, kind, locale);
    const text = stringify(raw);
    if (typeof key === 'number' && Number.isNaN(key)) {
      if (out.length < limit)
        out.push({ row: i + 1, previous: prev?.text ?? '', value: `${text} (không đọc được)` });
      return;
    }
    if (prev) {
      const c = order(prev.key, key);
      if ((direction === 'asc' && c > 0) || (direction === 'desc' && c < 0)) {
        if (out.length < limit) out.push({ row: i + 1, previous: prev.text, value: text });
      }
    }
    prev = { key, text };
  });
  return out;
}

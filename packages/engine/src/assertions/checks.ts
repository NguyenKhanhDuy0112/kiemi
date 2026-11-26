import { z } from 'zod';
import { readRows } from '../actions/_table';
import type { ActionContext } from '../define-action';
import { EngineError } from '../errors';
import { countMatches } from '../locator/resolve';
import { TargetParamSchema, toLocator } from '../run/target';
import { stringify } from '../vars/evaluate';
import {
  allowance,
  CountOpSchema,
  compareDate,
  compareNumber,
  compareText,
  DateOpSchema,
  extractDate,
  extractNumber,
  NumberOpSchema,
  TextMatchOptions,
  TextOpSchema,
} from './compare';
import { describeDiff, diffTables, isClean, sameCell } from './table-diff';
import { ROW_OPS, sortProblems, violations } from './table-rules';

export interface CheckResult {
  pass: boolean;
  actual?: unknown;
  expected?: unknown;
  /** Structured data kept in the failure (e.g. the cells that differ) [P-06]. */
  details?: Record<string, unknown>;
  /** No point retrying (the check moved the page, e.g. walked every page). */
  final?: boolean;
}

/**
 * A single-shot check used by assertion steps (retried until timeout) and by
 * conditions (if / waitUntil / skipIf) [B-01 → B-10, D-02, D-03, D-06].
 */
export interface CheckDef<P extends z.ZodType = z.ZodType> {
  name: string;
  params: P;
  check(params: z.output<P>, ctx: ActionContext): Promise<CheckResult>;
}

function defineCheck<P extends z.ZodType>(def: CheckDef<P>): CheckDef<P> {
  return def;
}

/** One resolution attempt (no waiting): the assertion loop does the waiting. */
const once = { timeoutMs: 0 } as const;

const target = TargetParamSchema;

async function elementText(ctx: ActionContext, t: z.infer<typeof target>): Promise<string> {
  const { locator } = await ctx.resolve(t, once);
  return locator.evaluate((el) => {
    const h = el as HTMLElement;
    if (h instanceof HTMLInputElement || h instanceof HTMLTextAreaElement) return h.value;
    if (h instanceof HTMLSelectElement) return h.selectedOptions[0]?.textContent ?? '';
    return h.innerText ?? h.textContent ?? '';
  });
}

const isNotFound = (err: unknown) =>
  err instanceof EngineError &&
  (err.code === 'ELEMENT_NOT_FOUND' || err.code === 'ELEMENT_AMBIGUOUS');

export const visibleCheck = defineCheck({
  name: 'visible',
  params: z.object({ target, state: z.enum(['visible', 'hidden', 'notExist']).default('visible') }),
  async check({ target: t, state }, ctx) {
    if (state === 'visible') {
      try {
        await ctx.resolve(t, once);
        return { pass: true, actual: 'visible', expected: state };
      } catch (err) {
        if (isNotFound(err)) return { pass: false, actual: 'not visible', expected: state };
        throw err;
      }
    }
    const page = await ctx.page();
    const { locator } = toLocator(t, ctx.run.testCase.elements);
    const resolved = ctx.vars.interpolate(locator);
    const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
    let count = 0;
    for (const f of frames)
      count += (await countMatches(f, resolved, state === 'hidden' ? 'visible' : 'attached')).count;
    return { pass: count === 0, actual: count === 0 ? state : 'visible', expected: state };
  },
});

const STATES = [
  'enabled',
  'disabled',
  'checked',
  'unchecked',
  'required',
  'optional',
  'readonly',
  'editable',
] as const;
export const stateCheck = defineCheck({
  name: 'state',
  params: z.object({ target, state: z.enum(STATES) }),
  async check({ target: t, state }, ctx) {
    const { locator } = await ctx.resolve(t, { ...once, state: 'attached' });
    const info = await locator.evaluate((el) => {
      const h = el as HTMLInputElement;
      const aria = (n: string) => h.getAttribute(`aria-${n}`) === 'true';
      return {
        disabled: h.disabled === true || aria('disabled'),
        checked: h.checked === true || aria('checked'),
        required: h.required === true || aria('required'),
        readonly: h.readOnly === true || aria('readonly'),
      };
    });
    const actual: Record<(typeof STATES)[number], boolean> = {
      enabled: !info.disabled,
      disabled: info.disabled,
      checked: info.checked,
      unchecked: !info.checked,
      required: info.required,
      optional: !info.required,
      readonly: info.readonly || info.disabled,
      editable: !info.readonly && !info.disabled,
    };
    return {
      pass: actual[state],
      actual: Object.entries(actual)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', '),
      expected: state,
    };
  },
});

const textParams = z.object({
  target,
  op: TextOpSchema.default('equals'),
  value: z.unknown().optional(),
  ...TextMatchOptions,
});

export const textCheck = defineCheck({
  name: 'text',
  params: textParams,
  async check(p, ctx) {
    const actual = await elementText(ctx, p.target);
    return { pass: compareText(actual, p.op, p.value, p), actual, expected: p.value };
  },
});

export const valueCheck = defineCheck({
  name: 'value',
  params: textParams,
  async check(p, ctx) {
    const { locator } = await ctx.resolve(p.target, once);
    const actual = await locator.evaluate((el) => {
      const h = el as HTMLInputElement;
      if ('value' in h && typeof h.value === 'string') return h.value;
      return (el as HTMLElement).innerText ?? '';
    });
    return { pass: compareText(actual, p.op, p.value, p), actual, expected: p.value };
  },
});

export const numberCheck = defineCheck({
  name: 'number',
  params: z
    .object({
      target: target.optional(),
      /** Compare a value (e.g. a variable) instead of an element. */
      actual: z.unknown().optional(),
      op: NumberOpSchema.default('eq'),
      value: z.unknown(),
      /** Upper bound for `between`. */
      max: z.unknown().optional(),
      /** Allowed gap for `eq`/`ne`, in the same unit [P-04]. */
      tolerance: z.unknown().optional(),
      /** Allowed gap for `eq`/`ne`, as % of the expected value [P-04]. */
      tolerancePercent: z.unknown().optional(),
    })
    .refine(
      (p) => p.target !== undefined || p.actual !== undefined,
      'target or actual is required',
    ),
  async check(p, ctx) {
    const locale = ctx.run.env?.locale ?? 'vi';
    const text = p.target ? await elementText(ctx, p.target) : stringify(p.actual);
    const actual = extractNumber(text, locale);
    const a = extractNumber(p.value, locale);
    const b = p.max === undefined ? undefined : extractNumber(p.max, locale);
    const tolerance = {
      absolute: p.tolerance === undefined ? undefined : extractNumber(p.tolerance, locale),
      percent:
        p.tolerancePercent === undefined ? undefined : extractNumber(p.tolerancePercent, locale),
    };
    if (actual === undefined || a === undefined)
      return { pass: false, actual: text, expected: p.value };
    const allowed = p.op === 'eq' || p.op === 'ne' ? allowance(a, tolerance) : 0;
    const gap = Number((actual - a).toFixed(10));
    return {
      pass: compareNumber(actual, p.op, a, b, tolerance),
      // Shows by how much it misses, so the tester can judge the tolerance [P-04].
      actual: allowed > 0 ? `${actual} (chênh ${gap > 0 ? '+' : ''}${gap})` : actual,
      expected:
        p.op === 'between'
          ? `${a} – ${b}`
          : allowed > 0
            ? `${a} ± ${Number(allowed.toFixed(10))}`
            : a,
    };
  },
});

export const dateCheck = defineCheck({
  name: 'date',
  params: z
    .object({
      target: target.optional(),
      actual: z.unknown().optional(),
      op: DateOpSchema.default('equals'),
      value: z.unknown().optional(),
      /** For `todayPlus`: days from today (negative = past). */
      days: z.number().int().default(0),
      /** Date format on the page, if unusual. */
      format: z.string().optional(),
    })
    .refine(
      (p) => p.target !== undefined || p.actual !== undefined,
      'target or actual is required',
    ),
  async check(p, ctx) {
    const text = p.target ? await elementText(ctx, p.target) : stringify(p.actual);
    const actual = extractDate(text, p.format);
    const expected = p.value === undefined ? undefined : extractDate(p.value);
    if (!actual) return { pass: false, actual: text, expected: p.value ?? `today+${p.days}` };
    return {
      pass: compareDate(actual, p.op, expected, p.days, new Date()),
      actual: text,
      expected:
        p.op === 'todayPlus' ? `today${p.days >= 0 ? '+' : ''}${p.days}d` : stringify(p.value),
    };
  },
});

export const countCheck = defineCheck({
  name: 'count',
  params: z.object({
    target,
    op: CountOpSchema.default('eq'),
    value: z.coerce.number().int().nonnegative(),
  }),
  async check(p, ctx) {
    const page = await ctx.page();
    const { locator } = toLocator(p.target, ctx.run.testCase.elements);
    const { count } = await countMatches(
      page.mainFrame(),
      ctx.vars.interpolate({ ...locator, nth: undefined }),
    );
    const pass =
      p.op === 'eq' ? count === p.value : p.op === 'gte' ? count >= p.value : count <= p.value;
    return { pass, actual: count, expected: p.value };
  },
});

export const tableCheck = defineCheck({
  name: 'table',
  params: z.object({
    /** The table (or grid). */
    target,
    /** Row selector: the row whose column `where.column` equals `where.value`. */
    where: z.object({ column: z.string().min(1), value: z.unknown() }),
    /** Column to check in that row. */
    column: z.string().min(1),
    op: TextOpSchema.default('equals'),
    value: z.unknown().optional(),
    ...TextMatchOptions,
  }),
  async check(p, ctx) {
    const { locator } = await ctx.resolve(p.target, once);
    const table = await locator.evaluate((el) => {
      const rowsOf = (root: Element) => [...root.querySelectorAll('tr, [role="row"]')];
      const cells = (row: Element) =>
        [
          ...row.querySelectorAll(
            ':scope > th, :scope > td, :scope > [role="cell"], :scope > [role="gridcell"], :scope > [role="columnheader"]',
          ),
        ].map((c) => (c as HTMLElement).innerText ?? c.textContent ?? '');
      const rows = rowsOf(el).map(cells);
      return { header: rows[0] ?? [], body: rows.slice(1) };
    });
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
    const whereIdx = table.header.findIndex((h) => norm(h) === norm(p.where.column));
    const colIdx = table.header.findIndex((h) => norm(h) === norm(p.column));
    if (whereIdx < 0 || colIdx < 0) {
      return {
        pass: false,
        actual: `columns: ${table.header.join(' | ')}`,
        expected: `${p.where.column} / ${p.column}`,
      };
    }
    const row = table.body.find((r) => norm(r[whereIdx] ?? '') === norm(stringify(p.where.value)));
    if (!row)
      return {
        pass: false,
        actual: `no row with ${p.where.column} = ${stringify(p.where.value)}`,
        expected: p.value,
      };
    const actual = row[colIdx] ?? '';
    return { pass: compareText(actual, p.op, p.value, p), actual, expected: p.value };
  },
});

/** Shared by the checks that read a whole table, optionally every page [Q-01 → Q-03]. */
const tableScope = {
  target,
  allPages: z.boolean().default(false),
  next: target.optional(),
  maxPages: z.coerce.number().int().positive().max(200).default(50),
};
const needsNext = [
  (p: { allPages: boolean; next?: unknown }) => !p.allPages || p.next !== undefined,
  'next (the next-page button) is required',
] as const;

/** Every row (all pages if asked) satisfies `column op value` [Q-01]. */
export const allRowsCheck = defineCheck({
  name: 'allRows',
  params: z
    .object({
      ...tableScope,
      column: z.string().min(1),
      op: z.enum(ROW_OPS),
      value: z.unknown().optional(),
      /** Upper bound for `between`. */
      max: z.unknown().optional(),
    })
    .refine(...needsNext),
  async check(p, ctx) {
    const { rows } = await readRows(ctx, { ...p, once: true });
    const bad = violations(rows, p.column, p.op, p.value, p.max, ctx.run.env?.locale ?? 'vi');
    return {
      pass: bad.length === 0 && rows.length > 0,
      actual:
        rows.length === 0
          ? 'no rows'
          : bad.length
            ? `${bad.length}/${rows.length} rows break it: ${bad
                .slice(0, 5)
                .map((v) => `#${v.row} ${v.value}`)
                .join(', ')}${bad.length > 5 ? ', …' : ''}`
            : `${rows.length} rows`,
      expected: `${p.column} ${p.op} ${stringify(p.value)}`,
      details: { rows: rows.length, violations: bad },
      final: p.allPages,
    };
  },
});

/** The table is sorted by a column, Vietnamese order for text [Q-02]. */
export const sortedCheck = defineCheck({
  name: 'sorted',
  params: z
    .object({
      ...tableScope,
      column: z.string().min(1),
      direction: z.enum(['asc', 'desc']).default('asc'),
      kind: z.enum(['auto', 'number', 'date', 'text']).default('auto'),
    })
    .refine(...needsNext),
  async check(p, ctx) {
    const { rows } = await readRows(ctx, { ...p, once: true });
    const bad = sortProblems(rows, p.column, p.direction, p.kind, ctx.run.env?.locale ?? 'vi');
    return {
      pass: bad.length === 0,
      actual: bad.length
        ? bad.map((b) => `row ${b.row}: "${b.value}" after "${b.previous}"`).join('; ')
        : `${rows.length} rows in order`,
      expected: `${p.column} ${p.direction === 'asc' ? 'ascending' : 'descending'}`,
      details: { rows: rows.length, problems: bad },
      final: p.allPages,
    };
  },
});

/** Number of rows (all pages) equals the total shown elsewhere ("Tổng 125") or a given value [Q-03]. */
export const rowTotalCheck = defineCheck({
  name: 'rowTotal',
  params: z
    .object({
      ...tableScope,
      /** Element that shows the total, e.g. "Tổng 125 bản ghi". */
      label: target.optional(),
      /** A fixed expected count instead of a label. */
      value: z.unknown().optional(),
    })
    .refine(...needsNext)
    .refine((p) => p.label !== undefined || p.value !== undefined, 'label or value is required'),
  async check(p, ctx) {
    const locale = ctx.run.env?.locale ?? 'vi';
    const { rows } = await readRows(ctx, { ...p, once: true });
    const shown = p.label ? await elementText(ctx, p.label) : stringify(p.value);
    const total = extractNumber(shown, locale);
    return {
      pass: total !== undefined && rows.length === total,
      actual: `${rows.length} rows`,
      expected: total === undefined ? shown : total,
      details: { rows: rows.length, shown },
      final: p.allPages,
    };
  },
});

/** A list given as a variable, or as JSON text typed in the editor. */
function asList(v: unknown): Record<string, unknown>[] | undefined {
  let value = v;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return Array.isArray(value) && value.every((x) => x !== null && typeof x === 'object')
    ? (value as Record<string, unknown>[])
    : undefined;
}

/** Table vs the expected list, matched by key, order ignored [P-06, Q-03]. */
export const tableCompareCheck = defineCheck({
  name: 'tableCompare',
  params: z
    .object({
      target,
      /** The expected rows: a list variable (`{{children.SanPham}}`) or JSON. */
      expected: z.unknown(),
      /** Column that identifies a row. */
      key: z.string().min(1),
      /** Columns to compare (default: all columns of the expected rows). */
      columns: z.array(z.string().min(1)).optional(),
      allPages: z.boolean().default(false),
      next: target.optional(),
      maxPages: z.coerce.number().int().positive().max(200).default(50),
    })
    .refine((p) => !p.allPages || p.next !== undefined, 'next (the next-page button) is required'),
  async check(p, ctx) {
    const expected = asList(p.expected);
    if (!expected)
      throw new EngineError('INVALID_PARAMS', 'expected must be a list of rows', {
        value: stringify(p.expected),
      });
    const { rows } = await readRows(ctx, { ...p, once: true });
    const diff = diffTables(rows, expected, p.key, p.columns, ctx.run.env?.locale ?? 'vi');
    const clean = isClean(diff) && diff.duplicates.length === 0;
    return {
      pass: clean,
      actual: clean ? `${rows.length} rows` : describeDiff(diff),
      expected: `${expected.length} rows by ${p.key}`,
      details: { ...diff },
      final: p.allPages,
    };
  },
});

/**
 * Expected value from two sources: a column the tester filled in the data and/or
 * a formula; with both they are cross-checked and a mismatch is warned [P-05].
 */
export const expectedCheck = defineCheck({
  name: 'expected',
  params: z
    .object({
      target: target.optional(),
      actual: z.unknown().optional(),
      /** Expectation typed in the data (e.g. `{{row.tongTien}}`). */
      data: z.unknown().optional(),
      /** Expectation computed by a formula (e.g. `{{TongDon(gioHang, 0)}}`). */
      formula: z.unknown().optional(),
      tolerance: z.unknown().optional(),
      tolerancePercent: z.unknown().optional(),
    })
    .refine((p) => p.target !== undefined || p.actual !== undefined, 'target or actual is required')
    .refine(
      (p) => blank(p.data) === false || blank(p.formula) === false,
      'data or formula is required',
    ),
  async check(p, ctx) {
    const locale = ctx.run.env?.locale ?? 'vi';
    const hasData = !blank(p.data);
    const hasFormula = !blank(p.formula);
    const tol = {
      absolute: p.tolerance === undefined ? undefined : extractNumber(p.tolerance, locale),
      percent:
        p.tolerancePercent === undefined ? undefined : extractNumber(p.tolerancePercent, locale),
    };
    const same = (a: unknown, b: unknown) => {
      const x = extractNumber(a, locale);
      const y = extractNumber(b, locale);
      if (x !== undefined && y !== undefined && /\d/.test(stringify(a)) && /\d/.test(stringify(b)))
        return compareNumber(x, 'eq', y, undefined, tol);
      return sameCell(a, b, locale);
    };
    if (hasData && hasFormula && !same(p.data, p.formula)) {
      ctx.log(
        `Kỳ vọng trong Excel khác công thức: Excel = ${stringify(p.data)}, công thức = ${stringify(p.formula)}`,
        'warn',
      );
    }
    const expected = hasData ? p.data : p.formula;
    const actual = p.target ? await elementText(ctx, p.target) : p.actual;
    return { pass: same(actual, expected), actual, expected };
  },
});

const blank = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export const urlCheck = defineCheck({
  name: 'url',
  params: z.object({
    op: TextOpSchema.default('equals'),
    value: z.unknown().optional(),
    ignoreCase: z.boolean().default(false),
    normalizeSpace: z.boolean().default(false),
  }),
  async check(p, ctx) {
    const page = await ctx.page();
    const expected =
      p.op === 'equals' || p.op === 'notEquals' ? ctx.run.url(stringify(p.value)) : p.value;
    const actual = page.url();
    return { pass: compareText(actual, p.op, expected, p), actual, expected };
  },
});

export const titleCheck = defineCheck({
  name: 'title',
  params: z.object({
    op: TextOpSchema.default('equals'),
    value: z.unknown().optional(),
    ...TextMatchOptions,
  }),
  async check(p, ctx) {
    const actual = await (await ctx.page()).title();
    return { pass: compareText(actual, p.op, p.value, p), actual, expected: p.value };
  },
});

/** Selectors commonly used by toast / message components. */
const TOAST_SELECTOR =
  '[role="alert"], [role="status"], [aria-live], .toast, .alert, .message, .notification, .snackbar, [class*="toast"], [class*="Toast"], [class*="notif"], [class*="message"]';

export const toastCheck = defineCheck({
  name: 'toast',
  params: z.object({
    text: z.unknown(),
    op: TextOpSchema.default('contains'),
    ...TextMatchOptions,
  }),
  async check(p, ctx) {
    const page = await ctx.page();
    const texts: string[] = [];
    for (const f of page.frames()) {
      try {
        texts.push(
          ...(await f
            .locator(`css=${TOAST_SELECTOR}`)
            .filter({ visible: true })
            .evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText ?? ''))),
        );
      } catch {
        // frame navigating
      }
    }
    // "Not contains / not equals" must hold for every message, not just one of them.
    const negative = p.op === 'notContains' || p.op === 'notEquals';
    const pass = negative
      ? texts.every((t) => compareText(t, p.op, p.text, p))
      : texts.some((t) => compareText(t, p.op, p.text, p));
    return { pass, actual: texts.length ? texts.join(' | ') : '(no message)', expected: p.text };
  },
});

/**
 * Error message shown for one field [R-05]: looks in what the input points to
 * (`aria-errormessage` / `aria-describedby`), the browser's own validation
 * message, and the smallest block around the input that holds no other field.
 * A message that appears next to a different field does not count.
 */
export const fieldErrorCheck = defineCheck({
  name: 'fieldError',
  params: z.object({
    target,
    message: z.unknown(),
    op: TextOpSchema.default('equals'),
    ...TextMatchOptions,
  }),
  async check(p, ctx) {
    const { locator } = await ctx.resolve(p.target, { ...once, state: 'attached' });
    const texts = await locator.evaluate((el) => {
      const out: string[] = [];
      const shown = (e: Element) => {
        const h = e as HTMLElement;
        const r = h.getBoundingClientRect();
        const st = getComputedStyle(h);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
      };
      const own = (e: Element) =>
        Array.from(e.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      for (const attr of ['aria-errormessage', 'aria-describedby']) {
        for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
          const t = document.getElementById(id);
          if (t && shown(t)) out.push((t as HTMLElement).innerText.trim());
        }
      }
      const native = (el as HTMLInputElement).validationMessage;
      if (native) out.push(native);
      const CONTROLS = 'input:not([type=hidden]), select, textarea';
      let box: Element = el;
      while (box.parentElement && box.parentElement !== document.body) {
        if (box.parentElement.querySelectorAll(CONTROLS).length > 1) break;
        box = box.parentElement;
      }
      const near: Element[] = [];
      if (box !== el) near.push(...Array.from(box.querySelectorAll('*')));
      else {
        for (let s = el.nextElementSibling, i = 0; s && i < 2; s = s.nextElementSibling, i++)
          near.push(s, ...Array.from(s.querySelectorAll('*')));
      }
      for (const c of near) {
        if (
          c === el ||
          c.contains(el) ||
          ['LABEL', 'OPTION', 'SCRIPT', 'STYLE'].includes(c.tagName)
        )
          continue;
        if (c.matches(CONTROLS) || c.closest('label') || !shown(c)) continue;
        const t = own(c);
        if (t) out.push(t);
      }
      return out;
    });
    const pass = texts.some((t) => compareText(t, p.op, p.message, p));
    return { pass, actual: texts.length ? texts.join(' | ') : '(no message)', expected: p.message };
  },
});

/** The keyboard focus is on this field [R-05]. */
export const focusCheck = defineCheck({
  name: 'focus',
  params: z.object({ target }),
  async check({ target: t }, ctx) {
    const { locator } = await ctx.resolve(t, { ...once, state: 'attached' });
    const info = await locator.evaluate((el) => {
      const a = document.activeElement;
      const describe = a
        ? `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''}${a.getAttribute('name') ? `[name=${a.getAttribute('name')}]` : ''}`
        : '(none)';
      return { focused: el === a || el.contains(a), describe };
    });
    return { pass: info.focused, actual: info.describe, expected: 'focused' };
  },
});

export const variableCheck = defineCheck({
  name: 'variable',
  params: z.object({
    name: z.string().min(1),
    op: TextOpSchema.default('equals'),
    value: z.unknown().optional(),
    ...TextMatchOptions,
  }),
  async check(p, ctx) {
    const actual = ctx.vars.get(p.name);
    return { pass: compareText(actual, p.op, p.value, p), actual, expected: p.value };
  },
});

export const CHECKS: readonly CheckDef[] = [
  visibleCheck,
  stateCheck,
  textCheck,
  valueCheck,
  numberCheck,
  dateCheck,
  countCheck,
  tableCheck,
  urlCheck,
  titleCheck,
  toastCheck,
  fieldErrorCheck,
  focusCheck,
  variableCheck,
  tableCompareCheck,
  allRowsCheck,
  sortedCheck,
  rowTotalCheck,
  expectedCheck,
] as CheckDef[];

export const CHECKS_BY_NAME: ReadonlyMap<string, CheckDef> = new Map(
  CHECKS.map((c) => [c.name, c]),
);

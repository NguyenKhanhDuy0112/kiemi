import type { Locator } from 'playwright-core';
import type { ActionContext, Place } from '../define-action';
import type { TargetParam } from '../run/target';

/** One table row: cells by header name, plus `text` (whole row) and `cells` (by position). */
export type TableRow = Record<string, unknown> & { text: string; cells: string[] };

/** Reads the body rows of a table / ARIA grid into objects keyed by header [D-04, P-02]. */
export function readTable(locator: Locator): Promise<TableRow[]> {
  return locator.evaluate((el) => {
    const text = (e: Element) => ((e as HTMLElement).innerText ?? e.textContent ?? '').trim();
    const rows = [...el.querySelectorAll('tr, [role="row"]')];
    const isHeader = (r: Element) =>
      r.querySelector('td, [role="cell"], [role="gridcell"]') === null;
    const header = rows.find(isHeader);
    const names = header ? [...header.children].map(text) : [];
    return rows
      .filter((r) => !isHeader(r))
      .map((r) => {
        const cells = [...r.children].map(text);
        const item: Record<string, unknown> = { text: text(r), cells };
        names.forEach((n, i) => {
          if (n && !(n in item)) item[n] = cells[i] ?? '';
        });
        return item as TableRow;
      });
  });
}

const VIRTUAL_MAX_ROWS = 5000;

/**
 * Reads a grid that only draws the rows in view (virtual scroll): scrolls its
 * scroll area from top to bottom, collects each row once (by `aria-rowindex`,
 * else by its text) and puts them back in order [W-03]. Identical rows without
 * `aria-rowindex` collapse into one.
 */
export function readVirtual(locator: Locator, maxRows = VIRTUAL_MAX_ROWS): Promise<TableRow[]> {
  return locator.evaluate(async (el, max) => {
    const text = (e: Element) => ((e as HTMLElement).innerText ?? e.textContent ?? '').trim();
    const scrolls = (n: Element) =>
      n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY);
    let scroller: Element | undefined = scrolls(el)
      ? el
      : [...el.querySelectorAll('*')].find(scrolls);
    for (let p = el.parentElement; !scroller && p; p = p.parentElement) {
      if (scrolls(p)) scroller = p;
    }
    const isHeader = (r: Element) =>
      r.querySelector('td, [role="cell"], [role="gridcell"]') === null;
    let names: string[] = [];
    const found = new Map<string, { order: number; item: Record<string, unknown> }>();
    const collect = () => {
      let added = 0;
      const rows = [...el.querySelectorAll('tr, [role="row"]')];
      if (names.length === 0) {
        const header = rows.find(isHeader);
        if (header) names = [...header.children].map(text);
      }
      for (const r of rows) {
        if (isHeader(r)) continue;
        const idx = r.getAttribute('aria-rowindex');
        const key = idx ? `i${idx}` : `t${text(r)}`;
        if (found.has(key)) continue;
        const cells = [...r.children].map(text);
        const item: Record<string, unknown> = { text: text(r), cells };
        names.forEach((n, i) => {
          if (n && !(n in item)) item[n] = cells[i] ?? '';
        });
        found.set(key, { order: idx ? Number(idx) : found.size + 1e9, item });
        added++;
      }
      return added;
    };
    // Two frames + a beat: enough for grids that render on scroll.
    const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
    const settle = async () => {
      await frame();
      await new Promise<void>((done) => setTimeout(done, 0));
    };
    if (!scroller) {
      collect();
    } else {
      const start = scroller.scrollTop;
      scroller.scrollTop = 0;
      await settle();
      for (let guard = 0; guard < 2000 && found.size < max; guard++) {
        // Nothing new after a scroll: the grid may still be drawing, give it more frames.
        for (let wait = 0; wait < 6 && collect() === 0 && guard > 0; wait++) await settle();
        const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
        if (atEnd) break;
        scroller.scrollTop += Math.max(1, Math.floor(scroller.clientHeight * 0.8));
        await settle();
      }
      collect();
      scroller.scrollTop = start;
    }
    return [...found.values()].sort((a, b) => a.order - b.order).map((v) => v.item);
  }, maxRows) as Promise<TableRow[]>;
}

export interface PagedOptions {
  /** Clicks "next"; returns false when there is no next page (button missing/disabled). */
  next: () => Promise<boolean>;
  maxPages: number;
  /** Reads the rows of the current page (default: what is in the DOM). */
  read?: (locator: Locator) => Promise<TableRow[]>;
  /** Wait budget for a page to change after "next" (ms). */
  changeMs: number;
}

/** Reads every page: read → next → wait until the rows change → repeat. */
export async function readAllPages(
  locator: Locator,
  opts: PagedOptions,
): Promise<{ rows: TableRow[]; pages: number }> {
  const read = opts.read ?? readTable;
  const all: TableRow[] = [];
  let pages = 0;
  let previous = '';
  while (pages < opts.maxPages) {
    const rows = await read(locator);
    const sig = JSON.stringify(rows.map((r) => r.cells));
    if (pages > 0 && sig === previous) break; // next did not change anything
    all.push(...rows);
    pages++;
    previous = sig;
    if (!(await opts.next())) break;
    const until = Date.now() + opts.changeMs;
    for (;;) {
      const now = JSON.stringify((await read(locator)).map((r) => r.cells));
      if (now !== previous || Date.now() > until) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return { rows: all, pages };
}

export interface ReadRowsOptions {
  target: TargetParam;
  allPages?: boolean | undefined;
  /** The "next page" button (with `allPages`). */
  next?: TargetParam | undefined;
  maxPages?: number | undefined;
  /** The grid draws only the rows in view: scroll to read them all [W-03]. */
  virtual?: boolean | undefined;
  /** One resolution attempt without waiting (assertions retry by themselves). */
  once?: boolean | undefined;
  /** Read the table in another tab / session [V-03]. */
  at?: Place | undefined;
}

/** Rows of the table on the page, optionally walking every page [P-02, P-06, Q-03]. */
export async function readRows(
  ctx: ActionContext,
  o: ReadRowsOptions,
): Promise<{ rows: TableRow[]; pages: number }> {
  const wait = { ...(o.once ? { timeoutMs: 0 } : {}), ...(o.at ? { at: o.at } : {}) };
  const { locator } = await ctx.resolve(o.target, wait);
  const read = o.virtual ? (l: Locator) => readVirtual(l) : readTable;
  if (!o.allPages || !o.next) return { rows: await read(locator), pages: 1 };
  const nextTarget = o.next;
  return readAllPages(locator, {
    maxPages: o.maxPages ?? 50,
    read,
    changeMs: Math.min(5000, Math.max(1, ctx.remainingMs())),
    next: async () => {
      const { locator: btn } = await ctx.resolve(nextTarget, { state: 'attached', ...wait });
      if (!(await btn.isEnabled().catch(() => false))) return false;
      await btn.click({ timeout: Math.max(1, ctx.remainingMs()) });
      return true;
    },
  });
}

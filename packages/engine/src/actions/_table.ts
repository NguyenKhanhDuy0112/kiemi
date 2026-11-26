import type { Locator } from 'playwright-core';
import type { ActionContext } from '../define-action';
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

export interface PagedOptions {
  /** Clicks "next"; returns false when there is no next page (button missing/disabled). */
  next: () => Promise<boolean>;
  maxPages: number;
  /** Wait budget for a page to change after "next" (ms). */
  changeMs: number;
}

/** Reads every page: read → next → wait until the rows change → repeat. */
export async function readAllPages(
  locator: Locator,
  opts: PagedOptions,
): Promise<{ rows: TableRow[]; pages: number }> {
  const all: TableRow[] = [];
  let pages = 0;
  let previous = '';
  while (pages < opts.maxPages) {
    const rows = await readTable(locator);
    const sig = JSON.stringify(rows.map((r) => r.cells));
    if (pages > 0 && sig === previous) break; // next did not change anything
    all.push(...rows);
    pages++;
    previous = sig;
    if (!(await opts.next())) break;
    const until = Date.now() + opts.changeMs;
    for (;;) {
      const now = JSON.stringify((await readTable(locator)).map((r) => r.cells));
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
  /** One resolution attempt without waiting (assertions retry by themselves). */
  once?: boolean | undefined;
}

/** Rows of the table on the page, optionally walking every page [P-02, P-06, Q-03]. */
export async function readRows(
  ctx: ActionContext,
  o: ReadRowsOptions,
): Promise<{ rows: TableRow[]; pages: number }> {
  const wait = o.once ? { timeoutMs: 0 } : {};
  const { locator } = await ctx.resolve(o.target, wait);
  if (!o.allPages || !o.next) return { rows: await readTable(locator), pages: 1 };
  const nextTarget = o.next;
  return readAllPages(locator, {
    maxPages: o.maxPages ?? 50,
    changeMs: Math.min(5000, Math.max(1, ctx.remainingMs())),
    next: async () => {
      const { locator: btn } = await ctx.resolve(nextTarget, { state: 'attached', ...wait });
      if (!(await btn.isEnabled().catch(() => false))) return false;
      await btn.click({ timeout: Math.max(1, ctx.remainingMs()) });
      return true;
    },
  });
}

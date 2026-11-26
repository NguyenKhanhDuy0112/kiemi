import type { Locator } from 'playwright-core';
import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { left, target, text } from './_common';

/** Where a row is in the grid: 1-based position of the cells that matter. */
interface RowSpot {
  /** Position of the column the row is matched by. */
  match: number;
  /** Position of the column the step works on (0 = none). */
  column: number;
}

/**
 * Scrolls a (virtual-scroll) grid until the row whose `where` cell equals `value`
 * is drawn; returns the column positions, or `undefined` when no row matches [W-03].
 */
function findRow(
  grid: Locator,
  where: { column: string; value: string },
  column: string | undefined,
): Promise<RowSpot | undefined | 'no-column'> {
  return grid.evaluate(
    async (el, a) => {
      const text = (e: Element) => ((e as HTMLElement).innerText ?? e.textContent ?? '').trim();
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
      const scrolls = (n: Element) =>
        n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY);
      let scroller: Element | undefined = scrolls(el)
        ? el
        : [...el.querySelectorAll('*')].find(scrolls);
      for (let p = el.parentElement; !scroller && p; p = p.parentElement) {
        if (scrolls(p)) scroller = p;
      }
      const isData = (r: Element) =>
        r.querySelector('td, [role="cell"], [role="gridcell"]') !== null;
      const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
      const settle = async () => {
        await frame();
        await new Promise<void>((done) => setTimeout(done, 0));
      };
      let names: string[] = [];
      const header = () => {
        const h = [...el.querySelectorAll('tr, [role="row"]')].find((r) => !isData(r));
        if (h) names = [...h.children].map((c) => norm(text(c)));
      };
      const look = (): 'no-column' | { match: number; column: number } | undefined => {
        if (names.length === 0) header();
        const match = names.indexOf(norm(a.where.column));
        const column = a.column === undefined ? -2 : names.indexOf(norm(a.column));
        if (match < 0 || column === -1) return 'no-column';
        for (const r of el.querySelectorAll('tr, [role="row"]')) {
          if (!isData(r)) continue;
          const cell = r.children[match];
          if (cell && norm(text(cell)) === norm(a.where.value)) {
            return { match: match + 1, column: Math.max(column + 1, 0) };
          }
        }
        return undefined;
      };
      if (scroller) {
        scroller.scrollTop = 0;
        await settle();
      }
      for (let guard = 0; guard < 2000; guard++) {
        const hit = look();
        if (hit) return hit;
        if (!scroller) return undefined;
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1)
          return undefined;
        scroller.scrollTop += Math.max(1, Math.floor(scroller.clientHeight * 0.8));
        await settle();
        const again = look();
        if (again) return again;
        await settle();
      }
      return undefined;
    },
    { where, column },
  );
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The row (drawn right now) whose cell number `match` equals `value`. */
function rowAt(grid: Locator, spot: RowSpot, value: string): Locator {
  const exact = new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`, 'i');
  return grid
    .locator('tr, [role="row"]')
    .filter({
      has: grid.page().locator(`css=:scope > :nth-child(${spot.match})`, { hasText: exact }),
    })
    .first();
}

/**
 * Work on one row of a grid, found by the value of one of its cells — even when the
 * grid draws only the rows in view: tick it, open its detail rows, edit a cell in
 * place, or click a cell [W-03].
 */
export const gridRowAction = defineAction({
  type: 'gridRow',
  params: z
    .object({
      target,
      where: z.object({ column: text, value: text }),
      do: z.enum(['select', 'unselect', 'expand', 'collapse', 'edit', 'click']).default('select'),
      /** Cell to edit / click. */
      column: text.optional(),
      /** New value of the cell (`edit`). */
      value: text.optional(),
    })
    .refine((p) => (p.do !== 'edit' && p.do !== 'click') || p.column !== undefined, {
      message: 'column is required to edit or click a cell',
    })
    .refine((p) => p.do !== 'edit' || p.value !== undefined, {
      message: 'value is required to edit a cell',
    }),
  ui: { label: 'actions.gridRow', icon: 'table', group: 'input' },
  async execute(p, ctx) {
    const { locator: grid } = await ctx.resolve(p.target);
    const deadline = Date.now() + left(ctx);
    let spot: RowSpot | undefined;
    // A full scan is slow on big grids: retry a couple of times (data may still load).
    for (let attempt = 0; attempt < 3; attempt++) {
      const started = Date.now();
      const found = await findRow(grid, p.where, p.column);
      if (found === 'no-column') {
        throw new EngineError(
          'INVALID_PARAMS',
          `The grid has no column "${p.column ?? p.where.column}"`,
          { column: p.column ?? p.where.column },
        );
      }
      spot = found;
      const scan = Date.now() - started;
      if (spot || Date.now() + scan * 1.5 + 500 > deadline) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!spot) {
      throw new EngineError(
        'ELEMENT_NOT_FOUND',
        `No grid row with ${p.where.column} = ${p.where.value}`,
        { column: p.where.column, value: p.where.value },
      );
    }
    const row = rowAt(grid, spot, p.where.value);
    const timeout = left(ctx);
    switch (p.do) {
      case 'select':
      case 'unselect': {
        const box = row.locator('input[type="checkbox"], [role="checkbox"]').first();
        if (await box.count()) {
          await (p.do === 'select' ? box.check({ timeout }) : box.uncheck({ timeout }));
        } else {
          // No tick box: the row itself is selected by clicking it.
          const selected = (await row.getAttribute('aria-selected', { timeout })) === 'true';
          if (selected !== (p.do === 'select')) await row.click({ timeout });
        }
        return;
      }
      case 'expand':
      case 'collapse': {
        const toggle = row.locator('[aria-expanded]').first();
        const open = (await toggle.getAttribute('aria-expanded', { timeout })) === 'true';
        if (open !== (p.do === 'expand')) await toggle.click({ timeout });
        return;
      }
      case 'click':
      case 'edit': {
        const cell = row.locator(`css=:scope > :nth-child(${spot.column})`);
        if (p.do === 'click') {
          await cell.click({ timeout });
          return;
        }
        await cell.dblclick({ timeout });
        // The editor may replace the row: look for the input again from the grid.
        const editor = rowAt(grid, spot, p.where.value)
          .locator(`css=:scope > :nth-child(${spot.column})`)
          .locator('input, textarea, [contenteditable="true"]')
          .first();
        await editor.fill(p.value as string, { timeout });
        await editor.press('Enter', { timeout });
        return;
      }
    }
  },
});

/**
 * Type into the filter box under a column header of a grid and apply it
 * (Enter) [W-03].
 */
export const gridFilterAction = defineAction({
  type: 'gridFilter',
  params: z.object({ target, column: text, value: text }),
  ui: { label: 'actions.gridFilter', icon: 'filter', group: 'input' },
  async execute({ target: t, column, value }, ctx) {
    const { locator: grid } = await ctx.resolve(t);
    const marked = await grid.evaluate((el, name) => {
      const text = (e: Element) => ((e as HTMLElement).innerText ?? e.textContent ?? '').trim();
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
      const rows = [...el.querySelectorAll('tr, [role="row"]')];
      const isData = (r: Element) =>
        r.querySelector('td, [role="cell"], [role="gridcell"]') !== null;
      const header = rows.find((r) => !isData(r));
      const idx = header ? [...header.children].findIndex((c) => norm(text(c)) === norm(name)) : -1;
      if (idx < 0) return 'no-column';
      const input = rows
        .filter((r) => !isData(r) && r !== header)
        .map((r) => r.children[idx]?.querySelector('input, select, textarea'))
        .find((i) => i);
      const box = input ?? header?.children[idx]?.querySelector('input, select, textarea');
      if (!box) return 'no-filter';
      box.setAttribute('data-kiemi-filter', '1');
      return 'ok';
    }, column);
    if (marked !== 'ok') {
      throw new EngineError(
        marked === 'no-column' ? 'INVALID_PARAMS' : 'ELEMENT_NOT_FOUND',
        marked === 'no-column'
          ? `The grid has no column "${column}"`
          : `No filter box under "${column}"`,
        { column },
      );
    }
    const box = grid.locator('[data-kiemi-filter]').first();
    try {
      await box.fill(value, { timeout: left(ctx) });
      await box.press('Enter', { timeout: left(ctx) });
    } finally {
      await box.evaluate((e) => e.removeAttribute('data-kiemi-filter')).catch(() => undefined);
    }
  },
});

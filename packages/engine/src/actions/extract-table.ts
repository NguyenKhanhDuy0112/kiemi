import { z } from 'zod';
import { defineAction } from '../define-action';
import { left, target } from './_common';
import { readAllPages, readTable } from './_table';

const MAX_ROWS = 5000;

/**
 * Save a table (or grid) of the page as a list of objects keyed by column
 * header [P-02]: `{{gioHang[0].thanhTien}}`, `{{gioHang.length}}`. With
 * `allPages` it clicks `next` until the last page.
 */
export const extractTableAction = defineAction({
  type: 'extractTable',
  params: z
    .object({
      target,
      into: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      allPages: z.boolean().default(false),
      /** The "next page" button (required with `allPages`). */
      next: target.optional(),
      maxPages: z.coerce.number().int().positive().max(200).default(50),
    })
    .refine((p) => !p.allPages || p.next !== undefined, 'next (the next-page button) is required'),
  ui: { label: 'actions.extractTable', icon: 'table', group: 'data' },
  async execute(p, ctx) {
    const { locator } = await ctx.resolve(p.target);
    let rows: Awaited<ReturnType<typeof readTable>>;
    let pages = 1;
    if (p.allPages && p.next) {
      const nextTarget = p.next;
      const res = await readAllPages(locator, {
        maxPages: p.maxPages,
        changeMs: Math.min(5000, left(ctx)),
        next: async () => {
          const { locator: btn } = await ctx.resolve(nextTarget, { state: 'attached' });
          if (!(await btn.isEnabled().catch(() => false))) return false;
          await btn.click({ timeout: left(ctx) });
          return true;
        },
      });
      rows = res.rows;
      pages = res.pages;
    } else {
      rows = await readTable(locator);
    }
    rows = rows.slice(0, MAX_ROWS);
    ctx.vars.set(p.into, rows);
    ctx.log(`${p.into} = ${rows.length} row(s), ${pages} page(s)`);
  },
});

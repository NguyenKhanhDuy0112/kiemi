import { z } from 'zod';
import { defineAction } from '../define-action';
import { target } from './_common';
import { readRows } from './_table';

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
    const { rows: all, pages } = await readRows(ctx, p);
    const rows = all.slice(0, MAX_ROWS);
    ctx.vars.set(p.into, rows);
    ctx.log(`${p.into} = ${rows.length} row(s), ${pages} page(s)`);
  },
});

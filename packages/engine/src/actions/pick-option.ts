import type { Locator, Page } from 'playwright-core';
import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { left, target, text } from './_common';

/** What custom dropdowns draw for their entries (Select2, Chosen, Ant Select, menus…). */
const OPTION_CSS = [
  '[role="option"]',
  '[role="menuitem"]',
  '[role="treeitem"]',
  '.select2-results__option',
  '.chosen-results li',
  '.ant-select-item-option',
  '.dropdown-item',
  '.ui-menu-item',
  '.autocomplete-suggestion',
  'li',
].join(', ');

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Visible entry called `option` — the exact name first, then one that contains it. */
async function visibleOption(page: Page, option: string): Promise<Locator | undefined> {
  const exact = new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`, 'i');
  const tries = [
    page.getByRole('option', { name: exact }),
    page.locator(OPTION_CSS).filter({ hasText: exact }),
    page.getByRole('option', { name: option }),
    page.locator(OPTION_CSS).filter({ hasText: option }),
  ];
  for (const candidates of tries) {
    const count = Math.min(await candidates.count(), 20);
    for (let i = 0; i < count; i++) {
      const item = candidates.nth(i);
      if (await item.isVisible().catch(() => false)) return item;
    }
  }
  return undefined;
}

/**
 * Choose an entry in a custom dropdown / searchable select / autocomplete
 * (Select2, Chosen, Ant Select…): open it, optionally type to search, then click
 * the entry [W-04].
 */
export const pickOptionAction = defineAction({
  type: 'pickOption',
  params: z.object({
    target,
    /** Text to type into the search box / autocomplete before choosing. */
    search: text.optional(),
    /** The entry to choose, as shown. */
    option: text,
  }),
  ui: { label: 'actions.pickOption', icon: 'list-checks', group: 'input' },
  async execute({ target: t, search, option }, ctx) {
    const { locator } = await ctx.resolve(t);
    const page = await ctx.page();
    await locator.click({ timeout: left(ctx) });
    if (search) await page.keyboard.type(search, { delay: 15 });
    const deadline = Date.now() + left(ctx);
    for (;;) {
      const item = await visibleOption(page, option);
      if (item) {
        await item.click({ timeout: Math.max(1, deadline - Date.now()) });
        return;
      }
      if (Date.now() > deadline - 200) {
        throw new EngineError('ELEMENT_NOT_FOUND', `No entry "${option}" in the list`, {
          option,
          ...(search ? { search } : {}),
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  },
});

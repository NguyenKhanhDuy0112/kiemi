import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';

/** Name of the flag a marked page carries; a reload wipes it [V-04]. */
export const LIVE_FLAG = '__kiemiLive';

/**
 * Marks a page so a later `assertLive` can tell the page was NOT reloaded:
 * mark tab B, change something in tab A, then check B updated by itself [V-04].
 */
export const markLiveAction = defineAction({
  type: 'markLive',
  params: z.object({
    session: z.string().min(1).optional(),
    tab: z.string().min(1).optional(),
  }),
  ui: { label: 'actions.markLive', icon: 'radio', group: 'flow' },
  async execute({ session, tab }, ctx) {
    const where = session ?? ctx.session;
    const page = tab
      ? ctx.run.pages.tabNamed(where, tab)
      : await ctx.run.pages.page(where).catch(() => undefined);
    if (!page) {
      throw new EngineError('TAB_NOT_FOUND', `No tab named "${tab ?? ''}"`, {
        by: 'name',
        value: tab ?? '',
        tabs: ctx.run.pages.tabNames(where).length,
      });
    }
    await page.evaluate((flag) => {
      (window as unknown as Record<string, unknown>)[flag] = true;
    }, LIVE_FLAG);
  },
});

import { z } from 'zod';
import { defineAction } from '../define-action';
import { holdsSecret, left, target, text } from './_common';

/** Type into a text box, textarea or contenteditable [A-02]. */
export const fillAction = defineAction({
  type: 'fill',
  params: z.object({
    target,
    value: text,
    /** Clear the field first (default). Off = append at the end. */
    clear: z.boolean().default(true),
    /** `keys`: key by key, for masked boxes and rich-text editors that ignore a plain fill [W-04]. */
    typing: z.enum(['fill', 'keys']).default('fill'),
  }),
  ui: { label: 'actions.fill', icon: 'text-cursor-input', group: 'input' },
  async execute({ target: t, value, clear, typing }, ctx) {
    const { locator } = await ctx.resolve(t);
    if (holdsSecret(ctx, value)) ctx.markSecret(locator);
    if (typing === 'keys') {
      await locator.click({ timeout: left(ctx) });
      if (clear) {
        await locator.press('ControlOrMeta+a', { timeout: left(ctx) });
        await locator.press('Delete', { timeout: left(ctx) });
      } else {
        await locator.press('End', { timeout: left(ctx) });
      }
      await locator.pressSequentially(value, { delay: 20, timeout: left(ctx) });
    } else if (clear) {
      await locator.fill(value, { timeout: left(ctx) });
    } else {
      await locator.click({ timeout: left(ctx) });
      await locator.press('End', { timeout: left(ctx) });
      await locator.pressSequentially(value, { timeout: left(ctx) });
    }
  },
});

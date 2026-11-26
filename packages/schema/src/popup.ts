import { z } from 'zod';
import { LocatorSchema } from './locator';

/**
 * "If you see X, press Y" — a popup that may show up at any time (cookie banner,
 * survey, "session expiring"…), handled for every test of the project [W-09].
 */
export const PopupRuleSchema = z.object({
  id: z.string().min(1),
  /** Shown to testers, e.g. "Banner cookie". */
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  /** What the popup looks like: matches while it is on the page. */
  when: LocatorSchema,
  /** What closes it. */
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('click'), target: LocatorSchema }),
    z.object({ kind: z.literal('escape') }),
  ]),
});
export type PopupRule = z.infer<typeof PopupRuleSchema>;
export type PopupRuleInput = z.input<typeof PopupRuleSchema>;

export const PopupRulesSchema = z.array(PopupRuleSchema).max(50);

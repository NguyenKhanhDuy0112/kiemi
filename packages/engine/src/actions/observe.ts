import { z } from 'zod';
import { defineAction } from '../define-action';
import { text } from './_common';

/**
 * Notes a value under a name; it is returned in the run result so two runs
 * (UAT vs Staging) can be compared field by field [V-06].
 */
export const observeAction = defineAction({
  type: 'observe',
  params: z.object({
    name: z.string().trim().min(1).max(100),
    value: text,
  }),
  ui: { label: 'actions.observe', icon: 'eye', group: 'flow' },
  execute({ name, value }, ctx) {
    ctx.run.observations[name] = value;
    ctx.log(`Noted "${name}"`);
  },
});

import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { target } from './_common';
import { readTable } from './_table';

const MAX_ITERATIONS = 1000;

/**
 * Repeat steps [D-04]: N times, over every data row, or over every row of a
 * table on the page. Inside: `{{loop.index}}` (from 1), `{{loop.count}}`, data
 * columns / table cells by header (`{{loop.Tên}}`), `{{loop.text}}`, `{{loop.cells[0]}}`.
 */
export const loopAction = defineAction({
  type: 'loop',
  params: z
    .object({
      over: z.enum(['times', 'data', 'tableRows']).default('times'),
      times: z.coerce.number().int().nonnegative().max(MAX_ITERATIONS).optional(),
      target: target.optional(),
      steps: z.array(z.record(z.string(), z.unknown())).min(1),
    })
    .refine((p) => p.over !== 'times' || p.times !== undefined, 'times is required')
    .refine(
      (p) => p.over !== 'tableRows' || p.target !== undefined,
      'target (the table) is required',
    ),
  ui: { label: 'actions.loop', icon: 'repeat', group: 'flow' },
  rawParams: ['steps'],
  container: true,
  async execute(p, ctx) {
    let items: Record<string, unknown>[];
    if (p.over === 'times') {
      items = Array.from({ length: p.times ?? 0 }, () => ({}));
    } else if (p.over === 'data') {
      items = [...(ctx.run.dataset?.rows ?? [])];
    } else {
      const { locator } = await ctx.resolve(p.target as NonNullable<typeof p.target>);
      items = await readTable(locator);
    }
    if (items.length > MAX_ITERATIONS) {
      throw new EngineError(
        'INVALID_PARAMS',
        `Too many iterations (${items.length} > ${MAX_ITERATIONS})`,
        { count: items.length },
      );
    }
    ctx.log(`Loop: ${items.length} iteration(s)`);
    for (const [i, item] of items.entries()) {
      await ctx.runSteps(p.steps, { loop: { ...item, index: i + 1, count: items.length } });
    }
  },
});

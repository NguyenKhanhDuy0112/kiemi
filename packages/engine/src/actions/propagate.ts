import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';

const steps = z.array(z.record(z.string(), z.unknown()));

/**
 * "When X changes, check it everywhere": every nested step is a place to look
 * at (detail, list, report, API, DB, exported file…). All of them run even if
 * one fails, and the failure names every place that was not updated [V-07].
 */
export const propagateAction = defineAction({
  type: 'propagate',
  params: z.object({ steps: steps.default([]) }),
  ui: { label: 'actions.propagate', icon: 'share-2', group: 'assert' },
  rawParams: ['steps'],
  container: true,
  async execute({ steps }, ctx) {
    const failed = await ctx.runAllSteps(steps);
    if (failed.length === 0) return;
    const places = failed.map((f) => f.stepId);
    throw new EngineError(
      'PROPAGATION_FAILED',
      `Step ${ctx.stepNo}: the change did not reach ${failed.length} place(s): ${places.join(', ')}`,
      {
        count: failed.length,
        places: places.join(', '),
        failed: failed.map((f) => ({
          stepId: f.stepId,
          code: f.error.code,
          message: f.error.message,
        })),
      },
    );
  },
});

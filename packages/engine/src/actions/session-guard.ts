import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { text } from './_common';

/**
 * From this step on, when a step fails and the page is the login page (the
 * session expired), run the shared login step, go back to the page the test
 * was on, and try the step again [W-08].
 */
export const sessionGuardAction = defineAction({
  type: 'sessionGuard',
  params: z.object({
    /** Part of the login page's address, or `/regex/`. */
    loginUrl: text,
    /** Name or id of the shared step that logs in. */
    shared: text,
    args: z.record(z.string(), z.unknown()).default({}),
    /** `false` turns the guard off again. */
    enabled: z.boolean().default(true),
  }),
  ui: { label: 'actions.sessionGuard', icon: 'log-in', group: 'flow' },
  execute({ loginUrl, shared, args, enabled }, ctx) {
    if (!enabled) {
      delete ctx.run.guard.current;
      return;
    }
    if (!ctx.run.sharedSteps.has(shared))
      throw new EngineError('UNKNOWN_SHARED_STEP', `Shared step "${shared}" not found`, { shared });
    ctx.run.guard.current = { loginUrl, shared, args };
  },
});

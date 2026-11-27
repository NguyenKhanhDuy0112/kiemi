import { z } from 'zod';
import { createIssue } from '../../issues/create';
import { publicProcedure, router } from '../trpc';

/** Files a bug found by a run in the project's issue tracker [X-02]. */
export const issuesRouter = router({
  create: publicProcedure
    .input(
      z.object({
        channelId: z.string().min(1),
        title: z.string().trim().min(1).max(300),
        body: z.string().max(60_000),
      }),
    )
    .mutation(({ ctx, input }) =>
      createIssue(ctx.services, input.channelId, { title: input.title, body: input.body }),
    ),
});

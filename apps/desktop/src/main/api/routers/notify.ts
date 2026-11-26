import { NotifyChannelInputSchema } from '@kiemi/schema';
import { z } from 'zod';
import { sendTest } from '../../notify/send';
import { publicProcedure, router } from '../trpc';

const id = z.string().min(1);

/** Channels that announce run results [X-03]. The secret goes in, never comes out. */
export const notifyRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: id }))
    .query(({ ctx, input }) => ctx.services.notifyChannels.list(input.projectId)),

  save: publicProcedure
    .input(
      z.object({
        projectId: id,
        id: id.optional(),
        channel: NotifyChannelInputSchema,
        /** Omit to keep the stored one. */
        secret: z.string().max(2000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.notifyChannels.save(input.projectId, input.channel, input.secret, input.id),
    ),

  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.notifyChannels.remove(input.id)),

  /** Sends a made-up result and remembers how it went. */
  test: publicProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    const r = await sendTest(ctx.services.notifyChannels.forTest(input.id));
    ctx.services.notifyChannels.setResult(input.id, r.ok, r.message);
    return r;
  }),
});

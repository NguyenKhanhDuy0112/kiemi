import { TRPCError } from '@trpc/server';
import { installSamples } from '../../samples/samples';
import { publicProcedure, router } from '../trpc';

export const samplesRouter = router({
  /** Creates (once) the sample project with its 4 tests; returns where to go [L-01, S-08]. */
  install: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.sampleSiteUrl)
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Sample site unavailable' });
    return installSamples(ctx.services, await ctx.sampleSiteUrl(), await ctx.sampleSiteDb?.());
  }),
});

import { SharedResourceInputSchema } from '@kiemi/db';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

const id = z.string().min(1);

/** Workspace library of shared steps/elements, usable across projects [O-07]. */
export const sharedResourcesRouter = router({
  list: publicProcedure
    .input(
      z.object({ kind: z.enum(['shared_step', 'element']).optional(), projectId: id.optional() }),
    )
    .query(({ ctx, input }) => ctx.services.sharedResources.list(input)),
  get: publicProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => ctx.services.sharedResources.get(input.id)),
  create: publicProcedure
    .input(SharedResourceInputSchema)
    .mutation(({ ctx, input }) => ctx.services.sharedResources.create(input)),
  update: publicProcedure
    .input(
      z.object({
        id,
        version: z.number().int().optional(),
        patch: z.object({ name: z.string().optional(), data: z.unknown().optional() }),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.sharedResources.update(input.id, input.patch, input.version),
    ),
  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.sharedResources.remove(input.id)),
  /** Copies a project shared step into the workspace library. */
  promoteSharedStep: publicProcedure
    .input(z.object({ sharedStepId: id }))
    .mutation(({ ctx, input }) =>
      ctx.services.sharedResources.promoteSharedStep(
        ctx.services.sharedSteps.get(input.sharedStepId),
      ),
    ),
  /** Tests (grouped by project) that call a shared step: the blast radius of a change [O-07]. */
  usages: publicProcedure.input(z.object({ sharedStepId: id })).query(({ ctx, input }) => {
    const names = new Map(ctx.services.projects.list().map((p) => [p.id, p.name]));
    const byProject = new Map<string, { id: string; name: string }[]>();
    for (const t of ctx.services.testCases.usersOfSharedStep(input.sharedStepId)) {
      const list = byProject.get(t.projectId) ?? [];
      list.push({ id: t.id, name: t.name });
      byProject.set(t.projectId, list);
    }
    return [...byProject].map(([projectId, tests]) => ({
      projectId,
      projectName: names.get(projectId) ?? projectId,
      tests,
    }));
  }),
});

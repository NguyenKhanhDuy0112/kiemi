import { publicProcedure, router } from '../trpc';

/** Whole-workspace names for the Ctrl/⌘ K search: tests, elements, shared steps [O-08]. */
export const searchRouter = router({
  index: publicProcedure.query(({ ctx }) => {
    const { projects, testCases, elements, sharedSteps, sharedResources } = ctx.services;
    const list = projects.list();
    return {
      projects: list.map((p) => ({ id: p.id, name: p.name })),
      tests: list.flatMap((p) =>
        testCases.list(p.id).map((t) => ({
          id: t.id,
          name: t.name,
          tags: t.tags,
          projectId: p.id,
          projectName: p.name,
        })),
      ),
      elements: list.flatMap((p) =>
        elements
          .list(p.id)
          .map((e) => ({ id: e.id, name: e.name, projectId: p.id, projectName: p.name })),
      ),
      sharedSteps: [
        ...list.flatMap((p) =>
          sharedSteps
            .list(p.id)
            .map((s) => ({ id: s.id, name: s.name, projectId: p.id, projectName: p.name })),
        ),
        ...sharedResources
          .list({ kind: 'shared_step' })
          .filter((r) => r.scope === 'workspace')
          .map((r) => ({ id: r.id, name: r.name, projectId: null, projectName: null })),
      ],
    };
  }),
});

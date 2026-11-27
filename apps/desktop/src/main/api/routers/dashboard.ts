import type { Services } from '@kiemi/db';
import { type DashRow, groupStats, statsOf } from '@kiemi/schema';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/** Flat rows (one per executed case) of the given projects, product taken from the test. */
export function dashRows(s: Services, projectIds: string[]): DashRow[] {
  const rows: DashRow[] = [];
  for (const projectId of projectIds) {
    const productOf = new Map(s.testCases.list(projectId).map((t) => [t.id, t.productId ?? null]));
    for (const run of s.runs.list(projectId)) {
      const at = (run.startedAt ?? run.createdAt).getTime();
      for (const c of s.runs.listCases(run.id)) {
        rows.push({
          runId: run.id,
          projectId,
          productId: productOf.get(c.testCaseId) ?? null,
          environmentId: run.environmentId,
          testCaseId: c.testCaseId,
          status: c.status,
          at,
        });
      }
    }
  }
  return rows;
}

/**
 * Dashboard by level [O-10]: no project → workspace (groups = projects);
 * a project → groups = products; a product → groups = environments.
 */
export const dashboardRouter = router({
  overview: publicProcedure
    .input(z.object({ projectId: z.string().min(1).optional(), productId: z.string().optional() }))
    .query(({ ctx, input }) => {
      const s = ctx.services;
      const projects = s.projects.list();
      if (!input.projectId) {
        const rows = dashRows(
          s,
          projects.map((p) => p.id),
        );
        const names = new Map(projects.map((p) => [p.id, p.name]));
        return {
          level: 'workspace' as const,
          total: statsOf(rows),
          groups: groupStats(rows, (r) => r.projectId).map((g) => ({
            ...g,
            name: names.get(g.key) ?? g.key,
          })),
          failing: [] as { id: string; name: string }[],
        };
      }
      const all = dashRows(s, [input.projectId]);
      const tests = new Map(s.testCases.list(input.projectId).map((t) => [t.id, t.name]));
      const failing = (ids: string[]) => ids.map((id) => ({ id, name: tests.get(id) ?? id }));
      if (input.productId === undefined) {
        const names = new Map(s.products.list(input.projectId).map((p) => [p.id, p.name]));
        const total = statsOf(all);
        return {
          level: 'project' as const,
          total,
          groups: groupStats(all, (r) => r.productId).map((g) => ({
            ...g,
            name: names.get(g.key) ?? '',
          })),
          failing: failing(total.failingTests),
        };
      }
      const rows = all.filter((r) => (r.productId ?? '') === input.productId);
      const names = new Map(s.environments.list(input.projectId).map((e) => [e.id, e.name]));
      const total = statsOf(rows);
      return {
        level: 'product' as const,
        total,
        groups: groupStats(rows, (r) => r.environmentId).map((g) => ({
          ...g,
          name: names.get(g.key) ?? '',
        })),
        failing: failing(total.failingTests),
      };
    }),
});

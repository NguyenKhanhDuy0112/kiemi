import type { Services } from '@kiemi/db';
import { type DashRow, flakyTests, groupStats, slowestTests, statsOf } from '@kiemi/schema';
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
          ...(c.durationMs === null ? {} : { durationMs: c.durationMs }),
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
          flaky: [] as { id: string; name: string; flips: number }[],
          slowest: [] as { id: string; name: string; avgMs: number }[],
        };
      }
      const all = dashRows(s, [input.projectId]);
      const tests = new Map(s.testCases.list(input.projectId).map((t) => [t.id, t.name]));
      const failing = (ids: string[]) => ids.map((id) => ({ id, name: tests.get(id) ?? id }));
      /** Flaky and slowest tests among these rows [T-07]. */
      const trends = (rows: DashRow[]) => ({
        flaky: flakyTests(rows).map((f) => ({
          id: f.testCaseId,
          name: tests.get(f.testCaseId) ?? f.testCaseId,
          flips: f.flips,
        })),
        slowest: slowestTests(rows).map((x) => ({
          id: x.testCaseId,
          name: tests.get(x.testCaseId) ?? x.testCaseId,
          avgMs: x.avgMs,
        })),
      });
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
          ...trends(all),
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
        ...trends(rows),
      };
    }),
});

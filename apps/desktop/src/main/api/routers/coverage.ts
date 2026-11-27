import type { Services } from '@kiemi/db';
import {
  type CoverageTest,
  computeCoverage,
  coverageScore,
  type ReqTest,
  requirementCoverage,
  signatureOf,
} from '@kiemi/schema';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/** Every `goto` address in the steps, also inside groups (if / loop / …). */
export function gotoUrls(steps: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.action === 'goto' && typeof (o.params as { url?: unknown } | undefined)?.url === 'string')
      out.push((o.params as { url: string }).url);
    for (const k of Object.keys(o)) if (typeof o[k] === 'object') walk(o[k]);
  };
  walk(steps);
  return out;
}

/** Coverage of the project's declared pages and of the tests' design labels [CV-01, CV-02, CV-04]. */
export const coverageRouter = router({
  /** Fingerprint of each test's steps, to spot duplicates in the quality check [CV-07]. */
  signatures: publicProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      Object.fromEntries(
        ctx.services.testCases
          .list(input.projectId)
          .map((t) => [t.id, signatureOf(ctx.services.testCases.get(t.id).content)]),
      ),
    ),

  /** Requirements with the tests linked by `req:<key>` and how they did [T-04, CV-05]. */
  requirements: publicProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(({ ctx, input }) => {
      const s = ctx.services;
      const last = new Map<string, string>();
      // Newest run first: the first status seen for a test is its latest.
      for (const run of s.runs.history(input.projectId, { limit: 300 })) {
        for (const c of s.runs.listCases(run.id)) {
          if (!last.has(c.testCaseId) && ['passed', 'failed', 'error'].includes(c.status))
            last.set(c.testCaseId, c.status);
        }
      }
      const tests: ReqTest[] = s.testCases.list(input.projectId).map((t) => ({
        id: t.id,
        name: t.name,
        tags: t.tags,
        lastStatus: last.get(t.id) ?? null,
      }));
      return requirementCoverage(s.projects.requirements(input.projectId), tests);
    }),

  get: publicProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(({ ctx, input }) => coverageOf(ctx.services, input.projectId).coverage),

  /** Combined coverage score, with one saved point per day for the trend [CV-09]. */
  score: publicProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(({ ctx, input }) => {
      const { coverage, tests } = coverageOf(ctx.services, input.projectId);
      const score = coverageScore(coverage, tests);
      const today = new Date().toISOString().slice(0, 10);
      let history = ctx.services.projects.coverageHistory(input.projectId);
      if (score.total !== null && history.at(-1)?.day !== today) {
        history = ctx.services.projects.recordCoverageScore(input.projectId, today, score.total);
      } else if (score.total !== null && history.at(-1)?.score !== score.total) {
        history = ctx.services.projects.recordCoverageScore(input.projectId, today, score.total);
      }
      return { score, history };
    }),
});

/** Coverage of the project's pages by its tests, and the number of tests. */
function coverageOf(s: Services, projectId: string) {
  const products = s.products.list(projectId);
  const keyOf = new Map(products.map((p) => [p.id, p.key]));
  const tests: CoverageTest[] = s.testCases.list(projectId).map((t) => ({
    id: t.id,
    name: t.name,
    tags: t.tags,
    urls: gotoUrls(s.testCases.get(t.id).content.steps),
    product: t.productId ? (keyOf.get(t.productId) ?? null) : null,
  }));
  return {
    coverage: computeCoverage(
      s.projects.pages(projectId),
      tests,
      s.projects.formSpecs(projectId),
      products[0]?.key ?? 'web',
    ),
    tests: tests.length,
  };
}

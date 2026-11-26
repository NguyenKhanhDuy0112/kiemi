import { type CoverageTest, computeCoverage, signatureOf } from '@kiemi/schema';
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

  get: publicProcedure.input(z.object({ projectId: z.string().min(1) })).query(({ ctx, input }) => {
    const s = ctx.services;
    const products = s.products.list(input.projectId);
    const keyOf = new Map(products.map((p) => [p.id, p.key]));
    const tests: CoverageTest[] = s.testCases.list(input.projectId).map((t) => ({
      id: t.id,
      name: t.name,
      tags: t.tags,
      urls: gotoUrls(s.testCases.get(t.id).content.steps),
      product: t.productId ? (keyOf.get(t.productId) ?? null) : null,
    }));
    return computeCoverage(
      s.projects.pages(input.projectId),
      tests,
      s.projects.formSpecs(input.projectId),
      products[0]?.key ?? 'web',
    );
  }),
});

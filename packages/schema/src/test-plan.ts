import { z } from 'zod';
import { type ManualCase, manualCaseStatus } from './manual-case';

/** Result of one item in a test round. */
export const PlanStatusSchema = z.enum(['notrun', 'pass', 'fail', 'blocked']);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const PlanItemSchema = z.object({
  id: z.string().min(1),
  /** `auto` = a test of the project; `manual` = a manual case [T-03]. */
  kind: z.enum(['auto', 'manual']),
  refId: z.string().min(1),
  /** Display name when the item was added (kept if the test is later deleted). */
  name: z.string().default(''),
  assignee: z.string().max(100).default(''),
  status: PlanStatusSchema.default('notrun'),
  note: z.string().default(''),
  /** Run the result was taken from (auto items). */
  runId: z.string().min(1).nullish(),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

/** A test round for a release: which tests, who runs them, how it went [T-02]. */
export const TestPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  /** Release or build the round is for, e.g. "3.2". */
  release: z.string().max(100).default(''),
  /** Key of the product the round is for; empty = whole project [O-13]. */
  product: z.string().max(40).default(''),
  items: z.array(PlanItemSchema).default([]),
});
export type TestPlan = z.infer<typeof TestPlanSchema>;

export const TestPlansSchema = z.array(TestPlanSchema).superRefine((all, ctx) => {
  const seen = new Set<string>();
  for (const [i, p] of all.entries()) {
    if (seen.has(p.id))
      ctx.addIssue({ code: 'custom', message: `Duplicate plan id "${p.id}"`, path: [i, 'id'] });
    seen.add(p.id);
  }
});

export type PlanCounts = Record<PlanStatus, number> & { total: number };

export function planCounts(items: Pick<PlanItem, 'status'>[]): PlanCounts {
  const out: PlanCounts = { total: items.length, notrun: 0, pass: 0, fail: 0, blocked: 0 };
  for (const it of items) out[it.status]++;
  return out;
}

/** Counts per person; items nobody owns go under the empty name. */
export function countsByAssignee(plan: TestPlan): Record<string, PlanCounts> {
  const groups = new Map<string, PlanItem[]>();
  for (const it of plan.items) groups.set(it.assignee, [...(groups.get(it.assignee) ?? []), it]);
  return Object.fromEntries([...groups].map(([who, items]) => [who, planCounts(items)]));
}

/** "Release 3.2: 120 case, 110 pass, 5 fail, 2 blocked, 3 not run" */
export function planHeadline(plan: TestPlan): string {
  const c = planCounts(plan.items);
  const head = plan.release ? `Release ${plan.release}` : plan.name;
  return `${head}: ${c.total} case, ${c.pass} pass, ${c.fail} fail, ${c.blocked} blocked, ${c.notrun} not run`;
}

/** Percent of items already decided (anything but "not run"), 0 for an empty plan. */
export function planProgress(plan: TestPlan): number {
  const c = planCounts(plan.items);
  return c.total === 0 ? 0 : Math.round(((c.total - c.notrun) / c.total) * 100);
}

/** Maps a stored run-case status to a plan status; `null` = not a verdict (skipped, cancelled…). */
export function planStatusOfRun(status: string): PlanStatus | null {
  if (status === 'passed') return 'pass';
  if (status === 'failed' || status === 'error') return 'fail';
  return null;
}

/**
 * Applies the cases of a run to the automatic items of the plan.
 * With several rows of one test, any failing row makes it fail.
 */
export function applyRun(
  plan: TestPlan,
  runId: string,
  cases: { testCaseId: string; status: string }[],
): TestPlan {
  const verdict = new Map<string, PlanStatus>();
  for (const c of cases) {
    const s = planStatusOfRun(c.status);
    if (!s) continue;
    const prev = verdict.get(c.testCaseId);
    verdict.set(c.testCaseId, prev === 'fail' || s === 'fail' ? 'fail' : 'pass');
  }
  return {
    ...plan,
    items: plan.items.map((it) => {
      const s = it.kind === 'auto' ? verdict.get(it.refId) : undefined;
      return s ? { ...it, status: s, runId } : it;
    }),
  };
}

/** Takes the current overall result of each manual case into the plan. */
export function syncManual(plan: TestPlan, cases: ManualCase[]): TestPlan {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return {
    ...plan,
    items: plan.items.map((it) => {
      const c = it.kind === 'manual' ? byId.get(it.refId) : undefined;
      if (!c) return it;
      const s = manualCaseStatus(c);
      return { ...it, status: s === 'untested' ? 'notrun' : s };
    }),
  };
}

export interface ReleaseRow {
  product: string;
  release: string;
  plans: number;
  counts: PlanCounts;
  /** Percent decided (not "not run"). */
  progress: number;
}

/**
 * Report by release [O-13]: rounds of the same product + release are merged.
 * Rounds without a release are left out (nothing to report on).
 */
export function releaseReport(plans: readonly TestPlan[]): ReleaseRow[] {
  const groups = new Map<string, TestPlan[]>();
  for (const p of plans) {
    if (!p.release.trim()) continue;
    const k = `${p.product}\u0000${p.release.trim()}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.entries()]
    .map(([k, ps]) => {
      const [product = '', release = ''] = k.split('\u0000');
      const counts = planCounts(ps.flatMap((p) => p.items));
      const progress =
        counts.total === 0 ? 0 : Math.round(((counts.total - counts.notrun) / counts.total) * 100);
      return { product, release, plans: ps.length, counts, progress };
    })
    .sort((a, b) => a.product.localeCompare(b.product) || a.release.localeCompare(b.release));
}

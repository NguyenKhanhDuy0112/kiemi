import type { ReportSheet } from '@kiemi/db';
import { countsByAssignee, planCounts, planHeadline, type TestPlan } from '@kiemi/schema';

type Tx = (key: string, vars?: Record<string, unknown>) => string;

/** A test round as two Excel sheets: totals per person, and one line per test [X-01]. */
export function buildPlanSheets(
  plan: TestPlan,
  nameOf: (item: TestPlan['items'][number]) => string,
  tx: Tx,
): ReportSheet[] {
  const status = (s: string) => tx(`ui.plans.status.${s}`);
  const total = planCounts(plan.items);
  const summary: ReportSheet = {
    name: tx('ui.report.xlsx.summary'),
    intro: [
      [`${tx('ui.plans.title')} — ${plan.name}`],
      [planHeadline(plan)],
      [tx('ui.plans.release'), plan.release],
    ],
    columns: [
      tx('ui.plans.assignee'),
      tx('ui.report.xlsx.totals'),
      status('pass'),
      status('fail'),
      status('blocked'),
      status('notrun'),
    ],
    rows: [
      [tx('ui.plans.all'), total.total, total.pass, total.fail, total.blocked, total.notrun],
      ...Object.entries(countsByAssignee(plan)).map(([who, c]) => [
        who || tx('ui.plans.nobody'),
        c.total,
        c.pass,
        c.fail,
        c.blocked,
        c.notrun,
      ]),
    ],
  };
  const detail: ReportSheet = {
    name: tx('ui.report.xlsx.detail'),
    columns: [
      tx('ui.report.xlsx.test'),
      tx('ui.plans.kind'),
      tx('ui.plans.assignee'),
      tx('ui.plans.result'),
      tx('ui.plans.note'),
    ],
    rows: plan.items.map((it) => [
      nameOf(it),
      tx(it.kind === 'auto' ? 'ui.plans.autoTag' : 'ui.plans.manualTag'),
      it.assignee,
      status(it.status),
      it.note,
    ]),
  };
  return [summary, detail];
}

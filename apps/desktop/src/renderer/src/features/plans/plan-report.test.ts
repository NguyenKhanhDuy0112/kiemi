import { type TestPlan, TestPlanSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { buildPlanSheets } from './plan-report';

const tx = (key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

const plan: TestPlan = TestPlanSchema.parse({
  id: 'p',
  name: 'Đợt 1',
  release: '3.2',
  items: [
    { id: 'a', kind: 'auto', refId: 't1', assignee: 'An', status: 'pass' },
    { id: 'b', kind: 'manual', refId: 'm1', assignee: 'An', status: 'fail', note: 'Sai' },
    { id: 'c', kind: 'auto', refId: 't2' },
  ],
});

describe('test round report [X-01]', () => {
  it('has a summary per person and a line for every test', () => {
    const [summary, detail] = buildPlanSheets(plan, (it) => `n-${it.refId}`, tx);
    expect(summary?.rows).toEqual([
      ['ui.plans.all', 3, 1, 1, 0, 1],
      ['An', 2, 1, 1, 0, 0],
      ['ui.plans.nobody', 1, 0, 0, 0, 1],
    ]);
    expect(detail?.rows[1]).toEqual([
      'n-m1',
      'ui.plans.manualTag',
      'An',
      'ui.plans.status.fail',
      'Sai',
    ]);
    expect(detail?.rows).toHaveLength(3);
  });
});

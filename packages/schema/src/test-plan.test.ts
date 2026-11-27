import { describe, expect, it } from 'vitest';
import { ManualCaseSchema } from './manual-case';
import {
  applyRun,
  countsByAssignee,
  planHeadline,
  planProgress,
  releaseReport,
  syncManual,
  type TestPlan,
  TestPlanSchema,
  TestPlansSchema,
} from './test-plan';

const plan = (): TestPlan =>
  TestPlanSchema.parse({
    id: 'p1',
    name: 'Đợt 1',
    release: '3.2',
    items: [
      { id: 'i1', kind: 'auto', refId: 't1', assignee: 'An' },
      { id: 'i2', kind: 'auto', refId: 't2', assignee: 'An' },
      { id: 'i3', kind: 'manual', refId: 'm1', assignee: 'Bình' },
      { id: 'i4', kind: 'auto', refId: 't3' },
    ],
  });

describe('test plans [T-02]', () => {
  it('applies a run: pass/fail only, any failing row fails, skipped keeps the old result', () => {
    const next = applyRun(plan(), 'r1', [
      { testCaseId: 't1', status: 'passed' },
      { testCaseId: 't1', status: 'failed' },
      { testCaseId: 't2', status: 'passed' },
      { testCaseId: 't3', status: 'skipped' },
    ]);
    expect(next.items.map((i) => i.status)).toEqual(['fail', 'pass', 'notrun', 'notrun']);
    expect(next.items[0]?.runId).toBe('r1');
    expect(next.items[3]?.runId).toBeUndefined();
  });
  it('takes manual results from the cases and leaves auto items alone', () => {
    const m = ManualCaseSchema.parse({
      id: 'm1',
      name: 'x',
      steps: [{ id: 's', status: 'blocked' }],
    });
    expect(syncManual(plan(), [m]).items.map((i) => i.status)).toEqual([
      'notrun',
      'notrun',
      'blocked',
      'notrun',
    ]);
  });
  it('summarises the round', () => {
    const p = applyRun(plan(), 'r', [{ testCaseId: 't1', status: 'passed' }]);
    expect(planHeadline(p)).toBe('Release 3.2: 4 case, 1 pass, 0 fail, 0 blocked, 3 not run');
    expect(planProgress(p)).toBe(25);
    expect(countsByAssignee(p).An).toMatchObject({ total: 2, pass: 1, notrun: 1 });
    expect(countsByAssignee(p)['']).toMatchObject({ total: 1 });
  });
  it('rejects duplicate plan ids', () => {
    expect(TestPlansSchema.safeParse([plan(), plan()]).success).toBe(false);
  });
});

describe('releaseReport [O-13]', () => {
  const item = (id: string, status: 'pass' | 'fail' | 'notrun') => ({
    id,
    kind: 'auto' as const,
    refId: id,
    name: id,
    assignee: '',
    status,
    note: '',
  });
  it('adds up rounds of the same product and release, skipping rounds without a release', () => {
    const rows = releaseReport([
      {
        id: 'a',
        name: 'A',
        release: '3.2',
        product: 'web',
        items: [item('1', 'pass'), item('2', 'fail')],
      },
      { id: 'b', name: 'B', release: '3.2', product: 'web', items: [item('3', 'notrun')] },
      { id: 'c', name: 'C', release: '3.2', product: 'api', items: [item('4', 'pass')] },
      { id: 'd', name: 'D', release: '', product: 'web', items: [item('5', 'pass')] },
    ]);
    expect(
      rows.map((r) => `${r.product}:${r.release}:${r.plans}:${r.counts.total}:${r.progress}`),
    ).toEqual(['api:3.2:1:1:100', 'web:3.2:2:3:67']);
  });
});

import { describe, expect, it } from 'vitest';
import { type DashRow, flakyTests, groupStats, slowestTests, statsOf } from './dashboard';

const row = (o: Partial<DashRow>): DashRow => ({
  runId: 'r1',
  projectId: 'p',
  productId: null,
  environmentId: null,
  testCaseId: 't1',
  status: 'passed',
  at: new Date(2026, 0, 1, 10).getTime(),
  ...o,
});

describe('dashboard stats [O-10]', () => {
  it('computes pass rate, last run and failing tests by latest result', () => {
    const s = statsOf([
      row({ testCaseId: 'a', status: 'failed', at: 1000 }),
      row({ testCaseId: 'a', status: 'passed', runId: 'r2', at: 2000 }),
      row({ testCaseId: 'b', status: 'error', runId: 'r2', at: 2000 }),
      row({ testCaseId: 'c', status: 'skipped', runId: 'r2', at: 2000 }),
    ]);
    expect(s.runs).toBe(2);
    expect(s.cases).toBe(3);
    expect(s.passRate).toBeCloseTo(1 / 3);
    expect(s.failingTests).toEqual(['b']);
    expect(s.lastRunId).toBe('r2');
  });

  it('has a null rate when nothing was counted', () => {
    expect(statsOf([]).passRate).toBeNull();
    expect(statsOf([row({ status: 'skipped' })]).passRate).toBeNull();
  });

  it('builds a daily trend, oldest first, capped', () => {
    const day = (d: number) => new Date(2026, 0, d, 9).getTime();
    const rows = [1, 2, 3].map((d) => row({ at: day(d), status: d === 2 ? 'failed' : 'passed' }));
    const s = statsOf(rows, 2);
    expect(s.trend.map((t) => t.day)).toEqual(['2026-01-02', '2026-01-03']);
    expect(s.trend[0]?.passRate).toBe(0);
  });

  it('groups with the worst group first', () => {
    const g = groupStats(
      [row({ environmentId: 'e1' }), row({ environmentId: 'e2', status: 'failed' })],
      (r) => r.environmentId,
    );
    expect(g.map((x) => x.key)).toEqual(['e2', 'e1']);
  });
});

describe('trends [T-07]', () => {
  const seq = (id: string, statuses: string[], ms = 1000) =>
    statuses.map((status, i) =>
      row({ testCaseId: id, status, at: 1000 + i, durationMs: ms, runId: `${id}${i}` }),
    );

  it('flags a test that flips between pass and fail, not one that broke once', () => {
    const rows = [
      ...seq('flaky', ['passed', 'failed', 'passed', 'passed', 'failed']),
      ...seq('broken', ['passed', 'passed', 'failed', 'failed', 'failed']),
      ...seq('good', ['passed', 'passed', 'passed']),
    ];
    expect(flakyTests(rows)).toEqual([{ testCaseId: 'flaky', flips: 3, results: 5 }]);
  });

  it('lists the slowest tests by average duration', () => {
    const rows = [
      ...seq('a', ['passed', 'passed'], 5000),
      ...seq('b', ['passed'], 900),
      ...seq('c', ['passed'], 2000),
    ];
    expect(slowestTests(rows, 2).map((s) => [s.testCaseId, s.avgMs])).toEqual([
      ['a', 5000],
      ['c', 2000],
    ]);
  });
});

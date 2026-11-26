import type { TestCase } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { buildReportSheets } from './report-tables';
import type { LiveRun } from './run-state';

const tx = (key: string, vars?: Record<string, unknown>) =>
  key.startsWith('ui.run.status.') ? key.slice('ui.run.status.'.length) : vars ? `${key}` : key;

const doc = {
  steps: [
    { id: 's1', action: 'goto', params: { url: '/x' } },
    { id: 's2', action: 'assertText', params: { target: { css: '#a' }, value: '1' } },
  ],
  cleanup: [],
  elements: {},
} as unknown as TestCase;

const run = {
  runId: 'r',
  status: 'failed',
  durationMs: 4200,
  cases: [
    {
      runCaseId: 'c1',
      testCaseId: 't1',
      testName: 'Đăng nhập',
      rowIndex: 1,
      status: 'failed',
      stepCount: 2,
      stepsDone: 2,
      durationMs: 2100,
      artifacts: [],
      steps: {
        s1: { status: 'passed', stepNo: '1', durationMs: 100, artifacts: [] },
        s2: {
          status: 'failed',
          stepNo: '2',
          durationMs: 300,
          artifacts: [],
          error: {
            code: 'ASSERTION_FAILED',
            message: 'x',
            details: { expected: '1', actual: '2' },
          },
        },
      },
    },
  ],
} as unknown as LiveRun;

describe('run report as Excel sheets [X-01]', () => {
  it('has a summary with one line per test × data row and a detail with expected vs actual', () => {
    const [summary, detail] = buildReportSheets({
      run,
      title: 'Smoke',
      environmentName: 'UAT',
      startedAt: null,
      tests: { t1: doc },
      screenshots: {},
      tx,
    });
    expect(summary?.name).toBe('ui.report.xlsx.summary');
    expect(summary?.rows).toHaveLength(1);
    expect(summary?.rows[0]?.slice(0, 4)).toEqual(['Đăng nhập', 2, 'failed', 2.1]);
    expect(detail?.rows).toHaveLength(2);
    expect(detail?.rows[1]?.slice(2, 8)).toEqual([
      '2',
      expect.any(String),
      'failed',
      0.3,
      '1',
      '2',
    ]);
    expect(detail?.rows[0]?.[6]).toBe('');
  });
});

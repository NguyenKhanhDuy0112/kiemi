import { describe, expect, it } from 'vitest';
import { cellView, type MatrixCell, matrixSummary } from './matrix';
import { initialRun, type LiveCase, type LiveRun } from './run-state';

const cell: MatrixCell = { environmentId: 'e1', browser: 'chrome', runId: 'r1' };
const c = (status: LiveCase['status']): LiveCase => ({
  runCaseId: status,
  testCaseId: status,
  testName: status,
  status,
  stepCount: 1,
  stepsDone: 1,
  steps: {},
  artifacts: [],
});
const run = (status: LiveRun['status'], cases: LiveCase[]): LiveRun => ({
  ...initialRun('r1'),
  status,
  cases,
});

describe('matrix cells [O-09]', () => {
  it('waits while the run is unknown', () => {
    expect(cellView(cell, undefined)).toMatchObject({ status: 'queued', total: 0 });
  });
  it('counts passed tests and turns a finished run with a failed test into failed', () => {
    expect(cellView(cell, run('passed', [c('passed'), c('passed')]))).toMatchObject({
      status: 'passed',
      passed: 2,
      total: 2,
    });
    expect(cellView(cell, run('passed', [c('passed'), c('failed')])).status).toBe('failed');
  });
  it('summarises finished and passed cells', () => {
    const a = cellView(cell, run('passed', [c('passed')]));
    const b = cellView(cell, run('running', [c('running')]));
    expect(matrixSummary([a, b])).toEqual({ total: 2, finished: 1, passed: 1, done: false });
    expect(matrixSummary([a]).done).toBe(true);
  });
});

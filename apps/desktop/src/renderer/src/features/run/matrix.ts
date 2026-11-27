import type { LiveRun, LiveRunStatus } from './run-state';
import { caseCounts, isFinished } from './run-state';

export type MatrixBrowser = 'msedge' | 'chrome' | 'chromium';

export interface MatrixCell {
  environmentId: string;
  browser: MatrixBrowser;
  runId: string;
}

export interface MatrixCellView {
  cell: MatrixCell;
  status: LiveRunStatus;
  passed: number;
  total: number;
}

/** The status a matrix cell shows: the run's, but "failed" when any test did not pass [O-09]. */
export function cellView(cell: MatrixCell, run: LiveRun | undefined): MatrixCellView {
  if (!run) return { cell, status: 'queued', passed: 0, total: 0 };
  const c = caseCounts(run);
  const notOk = c.failed + c.error > 0;
  const status: LiveRunStatus =
    run.status === 'passed' && notOk ? 'failed' : run.status === 'queued' ? 'queued' : run.status;
  return { cell, status, passed: c.passed, total: c.total };
}

/** One line for the whole matrix: finished cells, passed cells [O-09]. */
export function matrixSummary(views: MatrixCellView[]) {
  const finished = views.filter((v) => isFinished(v.status)).length;
  const passed = views.filter((v) => v.status === 'passed').length;
  return { total: views.length, finished, passed, done: finished === views.length };
}

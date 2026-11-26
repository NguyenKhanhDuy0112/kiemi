import type { RunTarget } from '@kiemi/db';
import type { ArtifactRef, RunError } from '@kiemi/schema';
import type { AppRouter } from '@main/api/root';
import type { RunFeedEvent } from '@main/run/run-manager';
import type { inferRouterOutputs } from '@trpc/server';

export type RunDetail = inferRouterOutputs<AppRouter>['runs']['get'];

export type LiveRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled' | 'error';
export type LiveCaseStatus = LiveRunStatus | 'skipped';
export type LiveStepStatus = 'running' | 'passed' | 'failed' | 'skipped';

export interface LiveStep {
  status: LiveStepStatus;
  stepNo: string;
  durationMs?: number | undefined;
  soft?: boolean | undefined;
  error?: RunError | undefined;
  artifacts: ArtifactRef[];
}

/** One test case × dataset row. */
export interface LiveCase {
  runCaseId: string;
  testCaseId: string;
  testName: string;
  rowIndex?: number | undefined;
  status: LiveCaseStatus;
  stepCount: number;
  stepsDone: number;
  currentStepNo?: string | undefined;
  steps: Record<string, LiveStep>;
  durationMs?: number | undefined;
  error?: RunError | undefined;
  /** Videos / traces of the case. */
  artifacts: ArtifactRef[];
}

/** What the Run / Result screen shows [S-03, S-04]. */
export interface LiveRun {
  runId: string;
  target?: RunTarget | undefined;
  status: LiveRunStatus;
  cases: LiveCase[];
  /** Chromium download (first run without Edge/Chrome) [N-03]. */
  downloadPercent?: number | undefined;
  /** Paused before this step [H-03]. */
  paused?: { runCaseId: string; stepId: string; stepNo: string } | undefined;
  /** Run-level error (engine crash, browser, SSH…). */
  error?: RunError | undefined;
  stopping: boolean;
  durationMs?: number | undefined;
}

export const isFinished = (s: LiveRunStatus) => s !== 'queued' && s !== 'running';

export function initialRun(runId: string): LiveRun {
  return { runId, status: 'queued', cases: [], stopping: false };
}

function updateCase(run: LiveRun, id: string, f: (c: LiveCase) => LiveCase): LiveRun {
  return { ...run, cases: run.cases.map((c) => (c.runCaseId === id ? f(c) : c)) };
}

/** Applies one event of `runs.events` to the live state (pure). */
export function applyFeed(run: LiveRun, e: RunFeedEvent): LiveRun {
  if (e.runId !== run.runId) return run;
  switch (e.type) {
    case 'plan':
      return {
        ...run,
        target: e.target,
        cases: e.cases.map(({ skipped, ...c }) => ({
          ...c,
          // Limited to other environments: shown as skipped with the reason [O-06].
          status: skipped ? 'skipped' : 'queued',
          ...(skipped ? { error: skipped } : {}),
          stepCount: 0,
          stepsDone: 0,
          steps: {},
          artifacts: [],
        })),
      };
    case 'status': {
      const done = isFinished(e.status);
      return {
        ...run,
        status: e.status,
        ...(e.error ? { error: e.error } : {}),
        ...(done
          ? {
              downloadPercent: undefined,
              paused: undefined,
              stopping: false,
              cases: run.cases.map((c) =>
                c.status === 'queued' || c.status === 'running'
                  ? {
                      ...c,
                      status:
                        e.status === 'cancelled' || e.status === 'error' ? e.status : 'skipped',
                      currentStepNo: undefined,
                    }
                  : c,
              ),
            }
          : {}),
      };
    }
    case 'download':
      return { ...run, downloadPercent: e.percent };
    case 'debug':
      return {
        ...run,
        paused:
          e.state === 'paused'
            ? { runCaseId: e.runCaseId, stepId: e.stepId, stepNo: e.stepNo }
            : undefined,
      };
    case 'engine': {
      const ev = e.event;
      switch (ev.type) {
        case 'runStart':
          return updateCase({ ...run, downloadPercent: undefined }, e.runCaseId, (c) => ({
            ...c,
            status: 'running',
            stepCount: ev.stepCount,
          }));
        case 'stepStart':
          return updateCase(run, e.runCaseId, (c) => ({
            ...c,
            currentStepNo:
              ev.phase === 'steps' ? (ev.stepNo ?? String(ev.index + 1)) : c.currentStepNo,
            steps: {
              ...c.steps,
              [ev.stepId]: {
                status: 'running',
                stepNo: ev.stepNo ?? String(ev.index + 1),
                artifacts: [],
              },
            },
          }));
        case 'stepEnd': {
          const r = ev.result;
          const top = ev.parentStepId === undefined && ev.phase === 'steps';
          return updateCase(run, e.runCaseId, (c) => ({
            ...c,
            stepsDone: top ? c.stepsDone + 1 : c.stepsDone,
            steps: {
              ...c.steps,
              [r.stepId]: {
                status: r.status,
                stepNo: c.steps[r.stepId]?.stepNo ?? String(ev.index + 1),
                durationMs: r.durationMs,
                soft: r.soft,
                error: r.error,
                artifacts: r.artifacts,
              },
            },
          }));
        }
        case 'runEnd':
          return updateCase(run, e.runCaseId, (c) => ({
            ...c,
            status: ev.result.status,
            currentStepNo: undefined,
            durationMs: ev.result.durationMs,
            error: ev.result.error,
            artifacts: ev.result.artifacts,
          }));
        default:
          return run;
      }
    }
  }
}

/** Same view model from what the DB stored (finished runs, history) [S-04, S-05]. */
export function fromDetail(d: RunDetail): LiveRun {
  return {
    runId: d.id,
    target: d.target ?? undefined,
    status: d.status,
    stopping: false,
    durationMs: d.durationMs ?? undefined,
    cases: d.cases.map((c) => {
      const steps: Record<string, LiveStep> = {};
      for (const s of c.steps) {
        steps[s.stepId] = {
          status: s.status as LiveStepStatus,
          stepNo: s.stepNo,
          durationMs: s.durationMs ?? undefined,
          soft: s.soft,
          error: s.error ?? undefined,
          artifacts: s.artifacts.map((a) => ({ kind: a.kind, path: a.path })),
        };
      }
      const top = c.steps.filter((s) => s.parentStepId === null && s.phase === 'steps');
      return {
        runCaseId: c.id,
        testCaseId: c.testCaseId,
        testName: c.testName,
        rowIndex: c.rowIndex ?? undefined,
        status: c.status as LiveCaseStatus,
        stepCount: top.length,
        stepsDone: top.length,
        steps,
        durationMs: c.durationMs ?? undefined,
        error: c.error ?? undefined,
        artifacts: c.artifacts.map((a) => ({ kind: a.kind, path: a.path })),
      };
    }),
  };
}

/** First hard failure of a case (for messages). */
export function firstFailure(c: LiveCase): RunError | undefined {
  const failed = Object.values(c.steps).find((s) => s.status === 'failed' && !s.soft && s.error);
  return failed?.error ?? c.error;
}

/** Passed / ran counts of top-level steps are not tracked per level: count cases instead. */
export function caseCounts(run: LiveRun) {
  const n = (s: LiveCaseStatus) => run.cases.filter((c) => c.status === s).length;
  return {
    total: run.cases.length,
    passed: n('passed'),
    failed: n('failed'),
    error: n('error'),
    skipped: n('skipped'),
    cancelled: n('cancelled'),
  };
}

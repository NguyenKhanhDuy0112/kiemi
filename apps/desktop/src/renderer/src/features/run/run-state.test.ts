import type { EngineEvent } from '@kiemi/engine';
import type { RunFeedEvent } from '@main/run/run-manager';
import { describe, expect, it } from 'vitest';
import { applyFeed, caseCounts, firstFailure, initialRun, isFinished } from './run-state';

const at = '2026-11-16T00:00:00.000Z';
const eng = (runCaseId: string, event: EngineEvent): RunFeedEvent => ({
  type: 'engine',
  runId: 'r1',
  runCaseId,
  event,
});
const start = (c: string, stepId: string, stepNo: string, parentStepId?: string) =>
  eng(c, {
    type: 'stepStart',
    runId: c,
    stepId,
    phase: 'steps',
    index: 0,
    session: 'default',
    at,
    stepNo,
    ...(parentStepId ? { parentStepId } : {}),
  });
const end = (
  c: string,
  stepId: string,
  status: 'passed' | 'failed' | 'skipped',
  parentStepId?: string,
) =>
  eng(c, {
    type: 'stepEnd',
    runId: c,
    phase: 'steps',
    index: 0,
    ...(parentStepId ? { parentStepId } : {}),
    result: {
      stepId,
      session: 'default',
      status,
      soft: false,
      startedAt: at,
      durationMs: 1200,
      artifacts: status === 'failed' ? [{ kind: 'screenshot', path: 'case-1/shot.png' }] : [],
      ...(status === 'failed' ? { error: { code: 'STEP_FAILED', message: 'x' } } : {}),
    },
  });

const plan: RunFeedEvent = {
  type: 'plan',
  runId: 'r1',
  target: { kind: 'suite', suiteId: 's', name: 'Bộ' },
  cases: [
    { runCaseId: 'c1', testCaseId: 't1', testName: 'A' },
    { runCaseId: 'c2', testCaseId: 't2', testName: 'B' },
  ],
};

describe('live run state [M4-02]', () => {
  it('follows cases, nested steps, pauses and the final status', () => {
    const events: RunFeedEvent[] = [
      plan,
      { type: 'status', runId: 'r1', status: 'running' },
      { type: 'download', runId: 'r1', percent: 40 },
      eng('c1', { type: 'runStart', runId: 'c1', testCaseId: 't1', at, stepCount: 2 }),
      start('c1', 's1', '1'),
      start('c1', 's1.a', '1.1', 's1'),
      end('c1', 's1.a', 'passed', 's1'),
      end('c1', 's1', 'passed'),
      { type: 'debug', runId: 'r1', runCaseId: 'c1', state: 'paused', stepId: 's2', stepNo: '2' },
    ];
    let run = initialRun('r1');
    for (const e of events) run = applyFeed(run, e);
    expect(run.paused).toEqual({ runCaseId: 'c1', stepId: 's2', stepNo: '2' });
    expect(run.downloadPercent).toBeUndefined();
    expect(run.cases[0]).toMatchObject({
      status: 'running',
      stepCount: 2,
      stepsDone: 1,
      currentStepNo: '1.1',
      steps: {
        s1: { status: 'passed', stepNo: '1', durationMs: 1200 },
        's1.a': { status: 'passed', stepNo: '1.1' },
      },
    });

    run = applyFeed(run, {
      type: 'debug',
      runId: 'r1',
      runCaseId: 'c1',
      state: 'running',
      stepId: 's2',
      stepNo: '2',
    });
    expect(run.paused).toBeUndefined();
    run = applyFeed(run, start('c1', 's2', '2'));
    run = applyFeed(run, end('c1', 's2', 'failed'));
    run = applyFeed(
      run,
      eng('c1', {
        type: 'runEnd',
        runId: 'c1',
        result: {
          runId: 'c1',
          testCaseId: 't1',
          status: 'failed',
          startedAt: at,
          durationMs: 3000,
          steps: [],
          cleanup: [],
          artifacts: [{ kind: 'video', path: 'case-1/video/a.webm' }],
          diagnostics: [],
        },
      }),
    );
    run = applyFeed(run, { type: 'status', runId: 'r1', status: 'failed' });
    expect(isFinished(run.status)).toBe(true);
    const [c1, c2] = run.cases;
    expect(c1).toMatchObject({
      status: 'failed',
      durationMs: 3000,
      artifacts: [{ kind: 'video' }],
    });
    expect(c1?.steps.s2?.artifacts).toEqual([{ kind: 'screenshot', path: 'case-1/shot.png' }]);
    expect(c1 && firstFailure(c1)).toMatchObject({ code: 'STEP_FAILED' });
    // Never started (stop on first failure) → skipped.
    expect(c2?.status).toBe('skipped');
    expect(caseCounts(run)).toMatchObject({ total: 2, failed: 1, skipped: 1, passed: 0 });
  });

  it('ignores events of another run and keeps engine errors', () => {
    const run = initialRun('r1');
    expect(applyFeed(run, { type: 'status', runId: 'other', status: 'passed' })).toBe(run);
    const crashed = applyFeed(applyFeed(run, plan), {
      type: 'status',
      runId: 'r1',
      status: 'error',
      error: { code: 'ENGINE_CRASHED', message: 'gone' },
    });
    expect(crashed.error?.code).toBe('ENGINE_CRASHED');
    expect(crashed.cases.map((c) => c.status)).toEqual(['error', 'error']);
  });
});

describe('plan with env-skipped case [O-06]', () => {
  it('marks the case skipped and keeps the reason', () => {
    const error = { code: 'ENV_SKIPPED', message: 'm', details: { environment: 'Prod' } } as never;
    const run = applyFeed(initialRun('r1'), {
      type: 'plan',
      runId: 'r1',
      target: { kind: 'testCase', testCaseId: 't' } as never,
      cases: [{ runCaseId: 'c1', testCaseId: 't', testName: 'T', skipped: error }],
    });
    expect(run.cases[0]?.status).toBe('skipped');
    expect(run.cases[0]?.error).toBe(error);
  });
});

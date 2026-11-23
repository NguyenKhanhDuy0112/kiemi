import { type RunResult, RunResultSchema, type StepInput, TestCaseSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ActionRegistry, defineAction } from './define-action';
import type { EngineEvent } from './events';
import { DEFAULT_STEP_TIMEOUT_MS, runTestCase } from './runner';

const calls: string[] = [];

const record = defineAction({
  type: 'record',
  params: z.object({ value: z.string() }),
  ui: { label: 'actions.record', icon: 'pencil', group: 'test' },
  execute: ({ value }, ctx) => {
    calls.push(`${ctx.session}:${value}`);
    ctx.log(`recorded ${value}`);
  },
});

const fail = defineAction({
  type: 'fail',
  params: z.object({}),
  ui: { label: 'actions.fail', icon: 'x', group: 'test' },
  execute: () => {
    throw new Error('boom');
  },
});

let lastSignal: AbortSignal | undefined;
const wait = defineAction({
  type: 'wait',
  params: z.object({ ms: z.number() }),
  ui: { label: 'actions.wait', icon: 'clock', group: 'test' },
  execute: ({ ms }, ctx) =>
    new Promise<void>((resolve) => {
      lastSignal = ctx.signal;
      setTimeout(resolve, ms);
    }),
});

const registry = () => new ActionRegistry([record, fail, wait]);

function testCase(steps: StepInput[], cleanup: StepInput[] = [], sessions = ['default']) {
  return TestCaseSchema.parse({
    schemaVersion: 2,
    id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f01',
    name: 'T',
    sessions,
    steps,
    cleanup,
  });
}

async function run(
  steps: StepInput[],
  cleanup: StepInput[] = [],
  extra: { signal?: AbortSignal; defaultStepTimeoutMs?: number; sessions?: string[] } = {},
) {
  calls.length = 0;
  const events: EngineEvent[] = [];
  const result = await runTestCase(
    {
      runId: 'run-1',
      testCase: testCase(steps, cleanup, extra.sessions),
      ...(extra.defaultStepTimeoutMs === undefined
        ? {}
        : { options: { defaultStepTimeoutMs: extra.defaultStepTimeoutMs } }),
    },
    {
      registry: registry(),
      onEvent: (e) => events.push(e),
      ...(extra.signal ? { signal: extra.signal } : {}),
    },
  );
  return { result, events };
}

const statuses = (r: RunResult) => r.steps.map((s) => s.status);

describe('runTestCase', () => {
  it('runs steps sequentially in order and passes', async () => {
    const { result } = await run(
      [
        { id: 's1', action: 'record', params: { value: 'a' } },
        { id: 's2', action: 'record', params: { value: 'b' }, session: 'admin' },
        { id: 's3', action: 'record', params: { value: 'c' } },
      ],
      [],
      { sessions: ['default', 'admin'] },
    );
    expect(calls).toEqual(['default:a', 'admin:b', 'default:c']);
    expect(result.status).toBe('passed');
    expect(statuses(result)).toEqual(['passed', 'passed', 'passed']);
    expect(() => RunResultSchema.parse(result)).not.toThrow();
  });

  it('streams runStart → stepStart/log/stepEnd → runEnd', async () => {
    const { events, result } = await run([{ id: 's1', action: 'record', params: { value: 'a' } }]);
    expect(events.map((e) => e.type)).toEqual([
      'runStart',
      'stepStart',
      'log',
      'stepEnd',
      'runEnd',
    ]);
    expect(events[0]).toMatchObject({ type: 'runStart', runId: 'run-1', stepCount: 1 });
    expect(events[2]).toMatchObject({ type: 'log', stepId: 's1', message: 'recorded a' });
    expect(events[4]).toEqual({ type: 'runEnd', runId: 'run-1', result });
  });

  it('stops after a hard failure and skips the rest', async () => {
    const { result } = await run([
      { id: 's1', action: 'fail' },
      { id: 's2', action: 'record', params: { value: 'b' } },
    ]);
    expect(result.status).toBe('failed');
    expect(statuses(result)).toEqual(['failed', 'skipped']);
    expect(result.steps[0]?.error).toMatchObject({ code: 'STEP_FAILED', message: 'boom' });
    expect(calls).toEqual([]);
  });

  it('continues after a soft failure but marks the run failed', async () => {
    const { result } = await run([
      { id: 's1', action: 'fail', mode: 'soft' },
      { id: 's2', action: 'record', params: { value: 'b' } },
    ]);
    expect(statuses(result)).toEqual(['failed', 'passed']);
    expect(result.steps[0]?.soft).toBe(true);
    expect(result.status).toBe('failed');
  });

  it('skips disabled steps without running them', async () => {
    const { result, events } = await run([
      { id: 's1', action: 'record', params: { value: 'a' }, enabled: false },
      { id: 's2', action: 'record', params: { value: 'b' } },
    ]);
    expect(calls).toEqual(['default:b']);
    expect(statuses(result)).toEqual(['skipped', 'passed']);
    expect(events.filter((e) => e.type === 'stepStart')).toHaveLength(1);
  });

  it('fails on unknown action and invalid params', async () => {
    const unknown = await run([{ id: 's1', action: 'nope' }]);
    expect(unknown.result.steps[0]?.error).toMatchObject({
      code: 'UNKNOWN_ACTION',
      details: { step: 1, action: 'nope' },
    });
    const invalid = await run([{ id: 's1', action: 'record', params: { value: 1 } }]);
    expect(invalid.result.steps[0]?.error?.code).toBe('INVALID_PARAMS');
    expect(calls).toEqual([]);
  });

  it('times out a step using its own timeoutMs and aborts the action signal [D-07]', async () => {
    const { result } = await run([
      { id: 's1', action: 'wait', params: { ms: 1000 }, timeoutMs: 20 },
      { id: 's2', action: 'record', params: { value: 'b' } },
    ]);
    expect(result.steps[0]?.error).toMatchObject({
      code: 'STEP_TIMEOUT',
      details: { step: 1, timeoutMs: 20 },
    });
    expect(lastSignal?.aborted).toBe(true);
    expect(statuses(result)).toEqual(['failed', 'skipped']);
  });

  it('uses the request default timeout, and a step override beats it [D-07]', async () => {
    const { result } = await run(
      [
        { id: 's1', action: 'wait', params: { ms: 50 }, timeoutMs: 500 },
        { id: 's2', action: 'wait', params: { ms: 200 } },
      ],
      [],
      { defaultStepTimeoutMs: 30 },
    );
    expect(statuses(result)).toEqual(['passed', 'failed']);
    expect(result.steps[1]?.error?.code).toBe('STEP_TIMEOUT');
    expect(DEFAULT_STEP_TIMEOUT_MS).toBe(10_000);
  });

  it('always runs cleanup, even after a failure [D-05]', async () => {
    const { result } = await run(
      [{ id: 's1', action: 'fail' }],
      [
        { id: 'c1', action: 'fail' },
        { id: 'c2', action: 'record', params: { value: 'clean' } },
      ],
    );
    expect(result.cleanup.map((s) => s.status)).toEqual(['failed', 'passed']);
    expect(calls).toEqual(['default:clean']);
  });

  it('marks the run failed when only cleanup fails', async () => {
    const { result } = await run(
      [{ id: 's1', action: 'record', params: { value: 'a' } }],
      [{ id: 'c1', action: 'fail' }],
    );
    expect(result.status).toBe('failed');
  });

  it('cancels the running step, skips the rest, still runs cleanup', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const { result } = await run(
      [
        { id: 's1', action: 'wait', params: { ms: 1000 } },
        { id: 's2', action: 'record', params: { value: 'b' } },
      ],
      [{ id: 'c1', action: 'record', params: { value: 'clean' } }],
      { signal: controller.signal },
    );
    expect(result.status).toBe('cancelled');
    expect(statuses(result)).toEqual(['skipped', 'skipped']);
    expect(result.steps[0]?.error?.code).toBe('RUN_CANCELLED');
    expect(calls).toEqual(['default:clean']);
  });

  it('ignores listener errors', async () => {
    const result = await runTestCase(
      { runId: 'r', testCase: testCase([{ id: 's1', action: 'record', params: { value: 'a' } }]) },
      {
        registry: registry(),
        onEvent: () => {
          throw new Error('listener');
        },
      },
    );
    expect(result.status).toBe('passed');
  });
});

describe('ActionRegistry', () => {
  it('registers, looks up and lists actions', () => {
    const r = registry();
    expect(r.has('record')).toBe(true);
    expect(r.get('nope')).toBeUndefined();
    expect(r.list().map((a) => a.type)).toEqual(['record', 'fail', 'wait']);
  });

  it('rejects duplicate action types', () => {
    expect(() => registry().register(record)).toThrow(/already registered/);
  });
});

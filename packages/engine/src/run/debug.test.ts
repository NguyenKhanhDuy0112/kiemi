import { type StepInput, TestCaseSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ActionRegistry, defineAction } from '../define-action';
import { runTestCase } from '../runner';
import { DebugController, type StepGate } from './debug';

const calls: string[] = [];
const note = defineAction({
  type: 'note',
  params: z.object({ value: z.string() }),
  ui: { label: 'actions.note', icon: 'pencil', group: 'test' },
  execute: ({ value }) => {
    calls.push(value);
  },
});
let failsLeft = 0;
const flaky = defineAction({
  type: 'flaky',
  params: z.object({ value: z.string() }),
  ui: { label: 'actions.flaky', icon: 'pencil', group: 'test' },
  execute: ({ value }) => {
    calls.push(value);
    if (failsLeft > 0) {
      failsLeft--;
      throw new Error('boom');
    }
  },
});
const registry = new ActionRegistry([note, flaky]);
const tick = () => new Promise((r) => setTimeout(r, 5));

const tc = (steps: StepInput[], cleanup: StepInput[] = []) =>
  TestCaseSchema.parse({
    schemaVersion: 2,
    id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f01',
    name: 'T',
    steps,
    cleanup,
  });
const notes = (...v: string[]): StepInput[] =>
  v.map((value) => ({ id: value, action: 'note', params: { value } }));

describe('debugging a run [H-03]', () => {
  it('pauses at a breakpoint, steps one step, then resumes', async () => {
    calls.length = 0;
    const pauses: string[] = [];
    const dbg = new DebugController(
      { breakpoints: ['b'] },
      { onPause: (s: StepGate) => pauses.push(s.stepNo) },
    );
    const done = runTestCase(
      { runId: 'r', testCase: tc(notes('a', 'b', 'c', 'd'), notes('z')) },
      { registry, debugger: dbg },
    );
    await tick();
    expect(calls).toEqual(['a']);
    expect(dbg.paused?.stepId).toBe('b');
    dbg.step();
    await tick();
    expect(calls).toEqual(['a', 'b']);
    expect(dbg.paused?.stepId).toBe('c');
    dbg.resume();
    const result = await done;
    expect(calls).toEqual(['a', 'b', 'c', 'd', 'z']);
    expect(pauses).toEqual(['2', '3']);
    expect(result.status).toBe('passed');
  });

  it('pause() stops before the next step; cancel releases a paused run', async () => {
    calls.length = 0;
    const dbg = new DebugController({ pauseAtStart: true });
    const ac = new AbortController();
    const done = runTestCase(
      { runId: 'r', testCase: tc(notes('a', 'b'), notes('z')) },
      { registry, debugger: dbg, signal: ac.signal },
    );
    await tick();
    expect(calls).toEqual([]);
    expect(dbg.paused?.stepId).toBe('a');
    ac.abort();
    const result = await done;
    expect(result.status).toBe('cancelled');
    expect(calls).toEqual(['z']);
  });

  it('runs from step X, skipping the steps before it', async () => {
    calls.length = 0;
    const result = await runTestCase(
      { runId: 'r', testCase: tc(notes('a', 'b', 'c')), options: { startAtStepId: 'b' } },
      { registry },
    );
    expect(calls).toEqual(['b', 'c']);
    expect(result.steps.map((s) => s.status)).toEqual(['skipped', 'passed', 'passed']);
  });

  describe('pause on failure [FX-01, FX-05]', () => {
    const steps = (): StepInput[] => [
      { id: 'a', action: 'note', params: { value: 'a' } },
      { id: 'f', action: 'flaky', params: { value: 'f' } },
      { id: 'c', action: 'note', params: { value: 'c' } },
    ];
    const start = (failures: number, signal?: AbortSignal) => {
      calls.length = 0;
      failsLeft = failures;
      const seen: Array<string | undefined> = [];
      const dbg = new DebugController(
        { pauseOnFail: true },
        { onPause: (s, e) => seen.push(`${s.stepId}:${e?.message ?? ''}`) },
      );
      const done = runTestCase(
        { runId: 'r', testCase: tc(steps(), notes('z')) },
        { registry, debugger: dbg, ...(signal ? { signal } : {}) },
      );
      return { dbg, done, seen };
    };

    it('keeps the run open on the failed step until the tester decides', async () => {
      const { dbg, seen, done } = start(5);
      await tick();
      expect(dbg.failed?.step.stepId).toBe('f');
      expect(seen).toEqual(['f:boom']);
      expect(calls).toEqual(['a', 'f']);
      dbg.decide('stop');
      const result = await done;
      expect(result.status).toBe('failed');
      expect(calls).toEqual(['a', 'f', 'z']);
    });

    it('retry runs the step again and the run goes on when it now passes', async () => {
      const { dbg, done } = start(1);
      await tick();
      dbg.step();
      const result = await done;
      expect(calls).toEqual(['a', 'f', 'f', 'c', 'z']);
      expect(result.status).toBe('passed');
    });

    it('skip marks the step skipped and keeps going', async () => {
      const { dbg, done } = start(5);
      await tick();
      dbg.decide('skip');
      const result = await done;
      expect(result.steps.map((s) => s.status)).toEqual(['passed', 'skipped', 'passed']);
      expect(calls).toEqual(['a', 'f', 'c', 'z']);
    });

    it('continue keeps the failure on record but runs the next steps', async () => {
      const { dbg, done } = start(5);
      await tick();
      dbg.resume();
      const result = await done;
      expect(result.steps.map((s) => s.status)).toEqual(['passed', 'failed', 'passed']);
      expect(result.status).toBe('failed');
      expect(calls).toEqual(['a', 'f', 'c', 'z']);
    });

    it('retry runs the edited step; edits also apply to steps not run yet', async () => {
      const { dbg, done } = start(5);
      await tick();
      dbg.editStep({
        id: 'f',
        action: 'note',
        params: { value: 'fixed' },
        session: 'default',
        enabled: true,
        mode: 'hard',
      } as never);
      dbg.editStep({
        id: 'c',
        action: 'note',
        params: { value: 'c2' },
        session: 'default',
        enabled: true,
        mode: 'hard',
      } as never);
      dbg.decide('retry');
      const result = await done;
      expect(calls).toEqual(['a', 'f', 'fixed', 'c2', 'z']);
      expect(result.status).toBe('passed');
    });

    it('cancel releases a run paused on a failure', async () => {
      const ac = new AbortController();
      const { done } = start(5, ac.signal);
      await tick();
      ac.abort();
      const result = await done;
      expect(result.status).toBe('cancelled');
    });

    it('does not pause when pauseOnFail is off', async () => {
      calls.length = 0;
      failsLeft = 5;
      const result = await runTestCase(
        { runId: 'r', testCase: tc(steps()) },
        { registry, debugger: new DebugController() },
      );
      expect(result.status).toBe('failed');
      expect(calls).toEqual(['a', 'f']);
    });

    it('runTo pauses before the chosen step', async () => {
      calls.length = 0;
      failsLeft = 0;
      const dbg = new DebugController({ pauseAtStart: true });
      const done = runTestCase(
        { runId: 'r', testCase: tc(notes('a', 'b', 'c', 'd')) },
        { registry, debugger: dbg },
      );
      await tick();
      dbg.runTo('c');
      await tick();
      expect(calls).toEqual(['a', 'b']);
      expect(dbg.paused?.stepId).toBe('c');
      dbg.resume();
      await done;
      expect(calls).toEqual(['a', 'b', 'c', 'd']);
    });
  });
});

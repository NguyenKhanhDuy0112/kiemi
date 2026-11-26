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
const registry = new ActionRegistry([note]);
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
});

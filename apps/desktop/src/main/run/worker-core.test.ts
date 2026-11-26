// @vitest-environment node
import type { RunOptions, RunRequest } from '@kiemi/engine';
import type { Recorder } from '@kiemi/recorder';
import type { RunResult } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import type { WorkerToHost } from './protocol';
import { createEngineWorker } from './worker-core';

const tick = () => new Promise((r) => setTimeout(r, 5));
const locator = { strategies: [{ kind: 'css', value: '#ok' }] } as never;

describe('engine worker: fixing a failed step [FX-02, FX-03]', () => {
  it('lets the tester Pick / Highlight on the paused page, then retries with the edit', async () => {
    const posted: WorkerToHost[] = [];
    const stopped: string[] = [];
    let decision: string | undefined;
    let edited: unknown;
    const recorder = {
      pick: async () => locator,
      highlight: async () => ({ count: 1 }),
      stop: async () => {
        stopped.push('stop');
        return [];
      },
    } as unknown as Recorder;
    const worker = createEngineWorker((m) => posted.push(m), {
      launch: async () => ({ browser: { close: async () => undefined } as never }),
      startRecorder: async () => recorder,
      run: async (_req: RunRequest, options: RunOptions) => {
        const dbg = options.debugger;
        decision = await dbg?.afterFail?.(
          { stepId: 's1', stepNo: '1', phase: 'steps', session: 'default' },
          { code: 'ELEMENT_NOT_FOUND', message: 'x' },
          new AbortController().signal,
          { context: async () => ({}) as never },
        );
        edited = dbg?.stepEdit?.('s1');
        return { status: 'passed' } as unknown as RunResult;
      },
    });
    const done = worker.handle({
      type: 'start',
      requests: [{ runId: 'r' } as RunRequest],
      launch: { settings: { browser: 'chrome' }, browsersPath: '' } as never,
      debug: { pauseOnFail: true },
    });
    await tick();
    expect(posted.find((m) => m.type === 'debug')).toMatchObject({
      state: 'paused',
      stepId: 's1',
      error: { code: 'ELEMENT_NOT_FOUND' },
    });

    await worker.handle({ type: 'livePick', requestId: 'p1', strings: {} });
    await worker.handle({ type: 'liveHighlight', requestId: 'h1', locator, strings: {} });
    await tick();
    expect(posted).toContainEqual({ type: 'pickResult', requestId: 'p1', locator });
    expect(posted).toContainEqual({
      type: 'highlightResult',
      requestId: 'h1',
      result: { count: 1 },
    });

    const step = { id: 's1', action: 'note', params: {} } as never;
    await worker.handle({ type: 'edit', step });
    await worker.handle({ type: 'decide', decision: 'retry' });
    await done;
    expect(decision).toBe('retry');
    expect(edited).toBe(step);
    expect(stopped).toEqual(['stop']);
  });
});

import {
  type ActionRegistry,
  createDefaultRegistry,
  DebugController,
  type LaunchBrowserOptions,
  type LaunchedBrowser,
  launchBrowser,
  type RunOptions,
  type RunRequest,
  runTestCase,
  toRunError,
} from '@kiemi/engine';
import type { RunResult } from '@kiemi/schema';
import { createRecordSession, type RecordDeps } from '../record/record-core';
import type { HostToWorker, WorkerToHost } from './protocol';

export interface WorkerDeps {
  launch?: (options: LaunchBrowserOptions) => Promise<Pick<LaunchedBrowser, 'browser'>>;
  run?: (request: RunRequest, options: RunOptions) => Promise<RunResult>;
  registry?: ActionRegistry;
  /** Recorder factory (tests use a fake one). */
  startRecorder?: RecordDeps['start'];
}

/**
 * The engine side of a run, free of Electron so it can be unit-tested: one
 * browser for every request, results streamed back as messages [N-05].
 * The utility process entry (`engine-worker.ts`) only wires it to `parentPort`.
 */
export function createEngineWorker(post: (msg: WorkerToHost) => void, deps: WorkerDeps = {}) {
  const launch = deps.launch ?? launchBrowser;
  const run = deps.run ?? runTestCase;
  const registry = deps.registry ?? createDefaultRegistry();
  const abort = new AbortController();
  let started = false;
  /** Request (run case) currently running, for debug messages. */
  let current = '';
  const debug = new DebugController(
    {},
    {
      onPause: (s, error) =>
        post({
          type: 'debug',
          state: 'paused',
          runCaseId: current,
          stepId: s.stepId,
          stepNo: s.stepNo,
          ...(error ? { error } : {}),
        }),
      onResume: (s) =>
        post({
          type: 'debug',
          state: 'running',
          runCaseId: current,
          stepId: s.stepId,
          stepNo: s.stepNo,
        }),
    },
  );

  async function start(msg: Extract<HostToWorker, { type: 'start' }>): Promise<void> {
    debug.setBreakpoints(msg.debug?.breakpoints ?? []);
    if (msg.debug?.pauseAtStart) debug.pause();
    debug.setPauseOnFail(msg.debug?.pauseOnFail === true);
    let launched: Pick<LaunchedBrowser, 'browser'> | undefined;
    try {
      launched = await launch({
        settings: msg.launch.settings,
        browsersPath: msg.launch.browsersPath,
        onDownloadProgress: (progress) => post({ type: 'download', progress }),
        signal: abort.signal,
      });
    } catch (err) {
      post({ type: 'fatal', error: toRunError(err, 'BROWSER_LAUNCH_FAILED') });
      return;
    }
    const results: RunResult[] = [];
    try {
      for (const request of msg.requests) {
        if (abort.signal.aborted) break;
        current = request.runId;
        const result = await run(request, {
          registry,
          browser: launched.browser,
          signal: abort.signal,
          debugger: debug,
          onEvent: (event) => post({ type: 'event', event }),
        });
        results.push(result);
        if (msg.stopOnFailure && result.status !== 'passed') break;
      }
      post({ type: 'done', results });
    } catch (err) {
      post({ type: 'fatal', error: toRunError(err, 'ENGINE_ERROR') });
    } finally {
      await launched.browser.close().catch(() => undefined);
    }
  }

  // One process = one run or one recording.
  const recording = createRecordSession(post, {
    registry,
    ...(deps.launch ? { launch: deps.launch } : {}),
    ...(deps.run ? { run: deps.run } : {}),
    ...(deps.startRecorder ? { start: deps.startRecorder } : {}),
  });

  return {
    /** Resolves when the message has been fully handled (a `start` = the whole run). */
    async handle(msg: HostToWorker): Promise<void> {
      switch (msg.type) {
        case 'recordCommand':
          recording.command(msg.command);
          return;
        case 'record':
          if (started) return;
          started = true;
          await recording.begin(msg);
          return;
        case 'cancel':
          abort.abort();
          return;
        case 'pause':
          debug.pause();
          return;
        case 'resume':
          debug.resume();
          return;
        case 'step':
          debug.step();
          return;
        case 'decide':
          debug.decide(msg.decision);
          return;
        case 'runTo':
          debug.runTo(msg.stepId);
          return;
        case 'breakpoints':
          debug.setBreakpoints(msg.stepIds);
          return;
      }
      if (started) return;
      started = true;
      await start(msg);
    },
  };
}

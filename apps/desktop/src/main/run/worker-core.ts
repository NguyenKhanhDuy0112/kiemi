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
import { type Recorder, type RecorderOptions, startRecorder } from '@kiemi/recorder';
import type { RunResult } from '@kiemi/schema';
import type { BrowserContext } from 'playwright-core';
import { createRecordSession } from '../record/record-core';
import type { HostToWorker, WorkerToHost } from './protocol';

export interface WorkerDeps {
  launch?: (options: LaunchBrowserOptions) => Promise<Pick<LaunchedBrowser, 'browser'>>;
  run?: (request: RunRequest, options: RunOptions) => Promise<RunResult>;
  registry?: ActionRegistry;
  /** Recorder factory (tests use a fake one). */
  startRecorder?: (context: BrowserContext, options: RecorderOptions) => Promise<Recorder>;
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
  const startRec = deps.startRecorder ?? startRecorder;
  /** Pick / Highlight helper on the paused run's page; lives until the run goes on [FX-03]. */
  let live: Recorder | undefined;
  const stopLive = () => {
    const r = live;
    live = undefined;
    void r?.stop().catch(() => undefined);
  };
  async function liveRecorder(strings: Record<string, string>): Promise<Recorder | undefined> {
    if (live) return live;
    const gate = debug.paused;
    const sessions = debug.live;
    if (!gate || !sessions) return undefined;
    const context = await sessions.context(gate.session);
    live = await startRec(context, {
      session: gate.session,
      strings,
      capture: false,
      toolbar: false,
    });
    return live;
  }
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
      onResume: (s) => {
        stopLive();
        post({
          type: 'debug',
          state: 'running',
          runCaseId: current,
          stepId: s.stepId,
          stepNo: s.stepNo,
        });
      },
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
        case 'edit':
          if (msg.step) debug.editStep(msg.step);
          if (msg.elements) debug.editElements(msg.elements);
          return;
        case 'livePick':
          void liveRecorder(msg.strings)
            .then((r) => r?.pick() ?? null)
            .catch(() => null)
            .then((locator) => post({ type: 'pickResult', requestId: msg.requestId, locator }));
          return;
        case 'liveHighlight':
          void liveRecorder(msg.strings)
            .then((r) => r?.highlight(msg.locator) ?? { count: 0 })
            .catch(() => ({ count: 0 }))
            .then((result) => post({ type: 'highlightResult', requestId: msg.requestId, result }));
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

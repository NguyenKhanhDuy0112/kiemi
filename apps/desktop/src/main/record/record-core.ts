import {
  type ActionRegistry,
  capturePageContext,
  type InteractiveScan,
  type LaunchBrowserOptions,
  type LaunchedBrowser,
  launchBrowser,
  type PageContext,
  proxyFor,
  type RunOptions,
  type RunRequest,
  runTestCase,
  type ScannedForm,
  SessionPages,
  scanForms,
  scanInteractive,
  toRunError,
} from '@kiemi/engine';
import { type Recorder, type RecorderOptions, startRecorder } from '@kiemi/recorder';
import type { RunResult } from '@kiemi/schema';
import type { BrowserContext, Page } from 'playwright-core';
import type { RecordCommand, RecordStart, WorkerToHost } from '../run/protocol';

/** How long a login saved from the toolbar can be reused (same default as the step) [F-02]. */
export const TOOLBAR_LOGIN_TTL_MS = 8 * 3_600_000;

export interface RecordDeps {
  launch?: (options: LaunchBrowserOptions) => Promise<Pick<LaunchedBrowser, 'browser'>>;
  run?: (request: RunRequest, options: RunOptions) => Promise<RunResult>;
  registry: ActionRegistry;
  start?: (context: BrowserContext, options: RecorderOptions) => Promise<Recorder>;
}

/**
 * Engine-process side of a recording [K-01…K-05, C-06, F-02, M-01]: opens a
 * visible browser (after running the steps before X when recording from step X),
 * runs the recorder in it and streams step changes back to main.
 */
export function createRecordSession(post: (msg: WorkerToHost) => void, deps: RecordDeps) {
  const launch = deps.launch ?? launchBrowser;
  const run = deps.run ?? runTestCase;
  const start = deps.start ?? startRecorder;
  let recorder: Recorder | undefined;
  let livePage: (() => Promise<Page>) | undefined;
  let finish: (() => void) | undefined;
  const stopped = new Promise<void>((resolve) => {
    finish = resolve;
  });
  /** Commands that arrive before the recorder is ready wait for it. */
  const queue: RecordCommand[] = [];

  function command(c: RecordCommand): void {
    if (c.kind === 'stop') {
      finish?.();
      return;
    }
    if (!recorder) {
      queue.push(c);
      return;
    }
    const r = recorder;
    if (c.kind === 'pick') {
      void r
        .pick()
        .catch(() => null)
        .then((locator) => post({ type: 'pickResult', requestId: c.requestId, locator }));
    } else if (c.kind === 'highlight') {
      void r
        .highlight(c.locator)
        .catch(() => ({ count: 0 }))
        .then((result) => post({ type: 'highlightResult', requestId: c.requestId, result }));
    } else if (c.kind === 'scanElements') {
      const requestId = c.requestId;
      void (async () => {
        let scan: InteractiveScan | null = null;
        try {
          const page = await livePage?.();
          if (page) scan = await scanInteractive(page);
        } catch {
          // The page may be closed or navigating: report nothing.
        }
        post({ type: 'scanElementsResult', requestId, scan });
      })();
    } else if (c.kind === 'pageContext') {
      const requestId = c.requestId;
      void (async () => {
        let context: PageContext | null = null;
        try {
          const page = await livePage?.();
          if (page) context = await capturePageContext(page);
        } catch {
          // The page may be closed or navigating: report nothing.
        }
        post({ type: 'pageContextResult', requestId, context });
      })();
    } else if (c.kind === 'scanForms') {
      const requestId = c.requestId;
      void (async () => {
        let forms: ScannedForm[] = [];
        try {
          const page = await livePage?.();
          if (page) forms = await scanForms(page);
        } catch {
          // The page may be closed or navigating: report no forms.
        }
        post({ type: 'scanResult', requestId, forms });
      })();
    } else {
      r.resolveSuggestion(c.id, c.accept);
    }
  }

  async function begin(msg: RecordStart): Promise<void> {
    let launched: Pick<LaunchedBrowser, 'browser'>;
    try {
      launched = await launch({
        settings: msg.launch.settings,
        browsersPath: msg.launch.browsersPath,
        onDownloadProgress: (progress) => post({ type: 'download', progress }),
      });
    } catch (err) {
      post({ type: 'fatal', error: toRunError(err, 'BROWSER_LAUNCH_FAILED') });
      return;
    }
    const browser = launched.browser;
    // Closing the browser window ends the recording.
    browser.on?.('disconnected', () => finish?.());
    let pages: SessionPages | undefined;
    try {
      let prefix: RunResult | undefined;
      if (msg.prefix) {
        prefix = await run(msg.prefix, {
          registry: deps.registry,
          browser,
          keepSessions: (p) => {
            pages = p;
          },
          onEvent: (e) => {
            if (e.type === 'loginSaved') post({ type: 'loginSaved', name: e.name, login: e.login });
          },
        });
      }
      pages ??= new SessionPages(browser, { proxy: proxyFor(msg.env, msg.secrets) });
      const context = await pages.context(msg.session);
      recorder = await start(context, {
        session: msg.session,
        strings: msg.strings,
        capture: msg.capture,
        toolbar: msg.capture,
        ...(msg.baseUrl ? { baseUrl: msg.baseUrl } : {}),
        onChange: (changes) => post({ type: 'recordChanges', changes }),
        onSuggestions: (list) => post({ type: 'recordSuggestions', list }),
        onStopRequest: () => post({ type: 'recordStopRequest' }),
        onSaveLogin: (name, state) =>
          post({
            type: 'loginSaved',
            name,
            login: { state, expiresAt: new Date(Date.now() + TOOLBAR_LOGIN_TTL_MS).toISOString() },
          }),
      });
      const sessionPages = pages;
      livePage = () => sessionPages.page(msg.session);
      const page = await sessionPages.page(msg.session);
      if (msg.url) await page.goto(msg.url).catch(() => undefined);
      await page.bringToFront().catch(() => undefined);
      post(prefix ? { type: 'recordReady', prefix } : { type: 'recordReady' });
      for (const c of queue.splice(0)) command(c);
      await stopped;
      const steps = await recorder.stop().catch(() => recorder?.steps ?? []);
      post({ type: 'recordDone', steps });
    } catch (err) {
      post({ type: 'fatal', error: toRunError(err, 'ENGINE_ERROR') });
    } finally {
      await pages?.closeAll();
      await browser.close().catch(() => undefined);
    }
  }

  return { begin, command };
}

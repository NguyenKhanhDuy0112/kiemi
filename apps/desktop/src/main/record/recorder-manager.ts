import type { Services } from '@kiemi/db';
import { mainAppUrl, type RunRequest, type SavedLogin, type ScannedForm } from '@kiemi/engine';
import type { HighlightResult, StepChange, Suggestion } from '@kiemi/recorder';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SESSION,
  type Env,
  type Locator,
  type RunError,
  type RunStatus,
  type Secrets,
  type Step,
  type TestCase,
  TestCaseSchema,
} from '@kiemi/schema';
import { translations } from '@kiemi/shared';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import type { RecordCommand, RecordStart, WorkerToHost } from '../run/protocol';
import type { WorkerHandle } from '../run/run-manager';
import { type OpenTunnel, prepareNetwork, type TunnelLike, usedProducts } from '../tunnel/network';

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const StartRecordingInputSchema = z.object({
  /** Test the browser opens for; leave out to open a page of a product (`projectId`) [R-02]. */
  testCaseId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  /** Product whose `{{app}}` URL is the base, with `projectId` and no test. */
  productKey: z.string().min(1).optional(),
  /** `inspect` = only Pick / Highlight, no steps [C-06]. */
  mode: z.enum(['record', 'inspect']).default('record'),
  /** `null` = no environment; omitted = the project's first one. */
  environmentId: z.string().min(1).nullable().optional(),
  /** "Ghi chèn từ bước X": the steps up to X run first, new steps go after X [K-04]. */
  afterStepId: z.string().min(1).optional(),
  /** Start page (relative = under the environment's base URL). Ignored with `afterStepId`. */
  url: z.string().max(4000).optional(),
  /** Start already logged in with a saved login [F-02]. */
  loginName: z.string().regex(NAME_RE).max(64).optional(),
});
export type StartRecordingInput = z.input<typeof StartRecordingInputSchema>;

export type RecordingState = 'starting' | 'recording' | 'stopped' | 'error';

/** What the renderer receives while recording. Never contains cookies or secrets. */
export type RecordFeedEvent =
  | {
      type: 'status';
      recordingId: string;
      state: RecordingState;
      error?: RunError;
      /** Result of the steps run before recording from step X [K-04]. */
      prefixStatus?: RunStatus;
    }
  | { type: 'download'; recordingId: string; percent: number }
  | { type: 'changes'; recordingId: string; changes: StepChange[] }
  | { type: 'suggestions'; recordingId: string; list: Suggestion[] }
  /** "Dừng" on the in-page toolbar. */
  | { type: 'stopRequest'; recordingId: string }
  | { type: 'loginSaved'; recordingId: string; name: string }
  | { type: 'done'; recordingId: string; steps: Step[] };

export interface RecorderManagerDeps {
  services: Services;
  spawnWorker: () => WorkerHandle;
  browsersPath: string;
  openTunnel?: OpenTunnel;
}

interface Active {
  id: string;
  testCaseId: string;
  projectId: string;
  mode: 'record' | 'inspect';
  session: string;
  afterStepId?: string | undefined;
  environmentId: string | null;
  history: RecordFeedEvent[];
  listeners: Set<() => void>;
  finished: boolean;
  worker?: WorkerHandle;
  tunnel?: TunnelLike;
  waiting: Map<string, (value: unknown) => void>;
}

export interface RecordingInfo {
  recordingId: string;
  testCaseId: string;
  mode: 'record' | 'inspect';
  session: string;
  afterStepId: string | null;
  environmentId: string | null;
}

const resolveUrl = (url: string, base: string | undefined) => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || !base) return url;
  return new URL(url, base.endsWith('/') ? base : `${base}/`).toString();
};

/**
 * Recording sessions in the engine utility process [K-01…K-05, C-06, F-02, M-01].
 * One at a time: starting another stops the current one. Saved logins are
 * stored encrypted here and never forwarded to the renderer.
 */
export class RecorderManager {
  readonly #d: RecorderManagerDeps;
  #active: Active | undefined;

  constructor(deps: RecorderManagerDeps) {
    this.#d = deps;
  }

  current(): RecordingInfo | null {
    const a = this.#active;
    if (!a || a.finished) return null;
    return {
      recordingId: a.id,
      testCaseId: a.testCaseId,
      mode: a.mode,
      session: a.session,
      afterStepId: a.afterStepId ?? null,
      environmentId: a.environmentId,
    };
  }

  start(raw: StartRecordingInput): RecordingInfo {
    const input = StartRecordingInputSchema.parse(raw);
    const s = this.#d.services;
    const row = input.testCaseId ? s.testCases.get(input.testCaseId) : undefined;
    if (!row && !input.projectId) throw new Error('A recording needs a test case or a project');
    // Without a test (scanning a form), an empty one stands for the product.
    const tc: TestCase = row
      ? s.testCases.forRun(row.id)
      : TestCaseSchema.parse({
          schemaVersion: CURRENT_SCHEMA_VERSION,
          id: uuidv7(),
          name: 'scan',
          ...(input.productKey ? { product: input.productKey } : {}),
          steps: [],
        });
    const projectId = row?.projectId ?? input.projectId ?? '';
    if (this.#active && !this.#active.finished) this.stop(this.#active.id);

    const environmentId =
      input.environmentId === undefined
        ? (s.environments.list(projectId)[0]?.id ?? null)
        : input.environmentId;
    const { env, secrets } = environmentId
      ? s.environments.forRun(environmentId)
      : { env: undefined, secrets: {} as Secrets };
    const settings = s.settings.getAll();
    // Stored as Playwright gave it (`storageState()`); the DB only checks the outline.
    const savedLogins = s.savedLogins.forRun(projectId) as unknown as Record<string, SavedLogin>;

    // Recording starts on the test's product in that environment [O-02].
    const appUrl = mainAppUrl(env, tc.product);
    const after = input.afterStepId ? tc.steps.find((x) => x.id === input.afterStepId) : undefined;
    const session = after?.session ?? DEFAULT_SESSION;
    const id = uuidv7();
    const base = {
      runId: `rec-${id}`,
      ...(env ? { env } : {}),
      secrets,
      sharedSteps: s.sharedSteps.forRun(projectId),
      savedLogins,
    };
    let prefix: RunRequest | undefined;
    if (after) {
      prefix = {
        ...base,
        testCase: tc,
        options: {
          defaultStepTimeoutMs: settings.defaultTimeoutSec * 1000,
          stopAfterStepId: after.id,
        },
      };
    } else if (input.loginName) {
      prefix = {
        ...base,
        testCase: {
          ...tc,
          steps: [
            {
              id: 'login',
              action: 'useSession',
              params: { name: input.loginName },
              session,
              enabled: true,
              mode: 'hard',
            },
          ],
          cleanup: [],
        },
        options: { stopAfterStepId: 'login' },
      };
    }
    const lang = settings.language;
    const msg: RecordStart = {
      type: 'record',
      launch: {
        // Recording needs a visible browser.
        settings: { browser: settings.browser, headless: false },
        browsersPath: this.#d.browsersPath,
      },
      ...(after ? {} : { url: resolveUrl(input.url ?? appUrl ?? 'about:blank', appUrl) }),
      ...(appUrl ? { baseUrl: appUrl } : {}),
      session,
      ...(env ? { env } : {}),
      secrets,
      ...(prefix ? { prefix } : {}),
      strings: { ...translations[lang].recorder },
      capture: input.mode === 'record',
    };

    const active: Active = {
      id,
      testCaseId: row?.id ?? '',
      projectId,
      mode: input.mode,
      session,
      afterStepId: after?.id,
      environmentId,
      history: [],
      listeners: new Set(),
      finished: false,
      waiting: new Map(),
    };
    this.#active = active;
    this.#publish(active, { type: 'status', recordingId: id, state: 'starting' });
    void this.#launch(active, msg, env, secrets, tc);
    return this.current() as RecordingInfo;
  }

  stop(recordingId: string): boolean {
    const a = this.#get(recordingId);
    if (!a) return false;
    if (!a.worker) {
      this.#finish(a, 'stopped');
      return true;
    }
    this.#send(a, { kind: 'stop' });
    // The browser closes with the worker if it does not answer.
    const w = a.worker;
    setTimeout(() => {
      if (!a.finished) {
        w.kill();
        this.#finish(a, 'stopped');
      }
    }, 10_000).unref?.();
    return true;
  }

  /** Lets the tester click an element in the recording browser [C-06]. */
  pick(recordingId: string): Promise<Locator | null> {
    const a = this.#get(recordingId);
    if (!a) return Promise.resolve(null);
    const requestId = uuidv7();
    const done = new Promise<Locator | null>((resolve) =>
      a.waiting.set(requestId, (v) => resolve(v as Locator | null)),
    );
    this.#send(a, { kind: 'pick', requestId });
    return done;
  }

  /** Shows a locator in the recording browser; 0 / 1 / several matches [C-06]. */
  highlight(recordingId: string, locator: Locator): Promise<HighlightResult> {
    const a = this.#get(recordingId);
    if (!a) return Promise.resolve({ count: 0 });
    const requestId = uuidv7();
    const done = new Promise<HighlightResult>((resolve) =>
      a.waiting.set(requestId, (v) => resolve(v as HighlightResult)),
    );
    this.#send(a, { kind: 'highlight', requestId, locator });
    return done;
  }

  /** Reads the forms of the page open in the browser [R-02]. */
  scanForms(recordingId: string): Promise<ScannedForm[]> {
    const a = this.#get(recordingId);
    if (!a) return Promise.resolve([]);
    const requestId = uuidv7();
    const done = new Promise<ScannedForm[]>((resolve) =>
      a.waiting.set(requestId, (v) => resolve(v as ScannedForm[])),
    );
    this.#send(a, { kind: 'scanForms', requestId });
    return done;
  }

  /** ✓ / ✕ on a suggested check [M-01]. */
  suggestion(recordingId: string, id: string, accept: boolean): boolean {
    const a = this.#get(recordingId);
    if (!a) return false;
    this.#send(a, { kind: 'suggestion', id, accept });
    return true;
  }

  async *events(recordingId: string, signal?: AbortSignal): AsyncGenerator<RecordFeedEvent> {
    const a = this.#active?.id === recordingId ? this.#active : undefined;
    if (!a) return;
    let next = 0;
    let wake: (() => void) | undefined;
    const notify = () => wake?.();
    a.listeners.add(notify);
    signal?.addEventListener('abort', notify);
    try {
      while (!signal?.aborted) {
        while (next < a.history.length) yield a.history[next++] as RecordFeedEvent;
        if (a.finished) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
    } finally {
      a.listeners.delete(notify);
      signal?.removeEventListener('abort', notify);
    }
  }

  async shutdown(): Promise<void> {
    const a = this.#active;
    if (a && !a.finished) {
      a.worker?.kill();
      this.#finish(a, 'stopped');
    }
  }

  #get(id: string): Active | undefined {
    const a = this.#active;
    return a && a.id === id && !a.finished ? a : undefined;
  }

  #send(a: Active, command: RecordCommand): void {
    a.worker?.send({ type: 'recordCommand', command });
  }

  async #launch(
    a: Active,
    start: RecordStart,
    env: Env | undefined,
    secrets: Secrets,
    tc: TestCase,
  ) {
    let msg = start;
    if (env) {
      try {
        const net = await prepareNetwork({
          env,
          secrets,
          used: usedProducts(env, [tc], start.prefix?.sharedSteps ?? []),
          openTunnel: this.#d.openTunnel,
        });
        a.tunnel = { proxyUrl: net.env.proxy?.server ?? '', close: net.close };
        const proxied: Env = net.env;
        msg = {
          ...start,
          env: proxied,
          ...(start.prefix ? { prefix: { ...start.prefix, env: proxied } } : {}),
        };
      } catch (err) {
        this.#finish(a, 'error', {
          code: 'SSH_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    }
    if (a.finished) return;
    let worker: WorkerHandle;
    try {
      worker = this.#d.spawnWorker();
    } catch (err) {
      this.#finish(a, 'error', {
        code: 'ENGINE_CRASHED',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    a.worker = worker;
    worker.onMessage((m) => this.#onMessage(a, m));
    worker.onExit((code) => {
      if (a.finished) return;
      this.#finish(a, 'error', {
        code: 'ENGINE_CRASHED',
        message: `Engine process exited with code ${code}`,
        details: { exitCode: code },
      });
    });
    worker.send(msg);
  }

  #onMessage(a: Active, m: WorkerToHost): void {
    if (a.finished) return;
    const recordingId = a.id;
    switch (m.type) {
      case 'download':
        this.#publish(a, { type: 'download', recordingId, percent: m.progress.percent });
        return;
      case 'recordReady':
        this.#publish(a, {
          type: 'status',
          recordingId,
          state: 'recording',
          ...(m.prefix ? { prefixStatus: m.prefix.status } : {}),
        });
        return;
      case 'recordChanges':
        this.#publish(a, { type: 'changes', recordingId, changes: m.changes });
        return;
      case 'recordSuggestions':
        this.#publish(a, { type: 'suggestions', recordingId, list: m.list });
        return;
      case 'recordStopRequest':
        this.#publish(a, { type: 'stopRequest', recordingId });
        return;
      case 'loginSaved':
        // Cookies: stored encrypted, never sent to the UI [F-02, N-07].
        try {
          this.#d.services.savedLogins.save(
            a.projectId,
            m.name,
            m.login.state,
            new Date(m.login.expiresAt),
          );
          this.#publish(a, { type: 'loginSaved', recordingId, name: m.name });
        } catch {
          // No OS encryption: not kept.
        }
        return;
      case 'pickResult':
        a.waiting.get(m.requestId)?.(m.locator);
        a.waiting.delete(m.requestId);
        return;
      case 'scanResult':
        a.waiting.get(m.requestId)?.(m.forms);
        a.waiting.delete(m.requestId);
        return;
      case 'highlightResult':
        a.waiting.get(m.requestId)?.(m.result);
        a.waiting.delete(m.requestId);
        return;
      case 'recordDone':
        this.#publish(a, { type: 'done', recordingId, steps: m.steps });
        this.#finish(a, 'stopped');
        return;
      case 'fatal':
        this.#finish(a, 'error', m.error);
        return;
      default:
        return;
    }
  }

  #finish(a: Active, state: 'stopped' | 'error', error?: RunError): void {
    if (a.finished) return;
    for (const resolve of a.waiting.values()) resolve(null);
    a.waiting.clear();
    this.#publish(a, {
      type: 'status',
      recordingId: a.id,
      state,
      ...(error ? { error } : {}),
    });
    a.finished = true;
    for (const l of a.listeners) l();
    a.worker?.kill();
    void a.tunnel?.close().catch(() => undefined);
  }

  #publish(a: Active, e: RecordFeedEvent): void {
    a.history.push(e);
    for (const l of a.listeners) l();
  }
}

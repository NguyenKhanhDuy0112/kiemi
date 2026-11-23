import { mkdir } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import {
  type ArtifactRef,
  type Dataset,
  type Diagnostic,
  type Env,
  type RunError,
  type RunResult,
  type RunStatus,
  type Secrets,
  type SharedStep,
  type Step,
  type StepResult,
  StepSchema,
  type TestCase,
} from '@kiemi/schema';
import type { Browser, Page, Locator as PwLocator } from 'playwright-core';
import type { z } from 'zod';
import { ensureFfmpeg, proxyFor, SessionPages, type ViewportSettings } from './browser';
import type { ActionContext, ActionRegistry } from './define-action';
import { EngineError, StepFailure, toRunError } from './errors';
import type { EngineEvent, EngineEventListener, LogLevel, StepPhase } from './events';
import { evaluateCondition } from './flow/condition';
import { type ResolvedLocator, resolveLocator } from './locator/resolve';
import type { RunDebugger } from './run/debug';
import type { SavedLogin } from './run/services';
import { DialogController, type RunServices } from './run/services';
import { toLocator } from './run/target';
import { mainAppUrl } from './vars/app';
import { maskSecrets, VariableStore } from './vars/store';

/** Default per-step timeout when neither the step nor the request sets one [D-07]. */
export const DEFAULT_STEP_TIMEOUT_MS = 10_000;

export interface ArtifactOptions {
  /** Folder for this run's screenshots, videos and traces. */
  dir: string;
  /** Screenshots: on failed steps (default), every step, or never [I-02]. */
  screenshots?: 'onFailure' | 'always' | 'off';
  /** Record a video of every session [I-03]. */
  video?: boolean;
  /** Record a Playwright trace of every session [I-03]. */
  trace?: boolean;
}

export interface RunRequest {
  runId: string;
  testCase: TestCase;
  dataset?: Dataset;
  env?: Env;
  secrets?: Secrets;
  rowIndex?: number;
  /** Shared steps callable with the `call` action [D-01]. */
  sharedSteps?: SharedStep[];
  /** Suite-level variables [E-02]. */
  suiteVariables?: Record<string, string>;
  /** Saved login sessions of the project, by name [F-02]. */
  savedLogins?: Record<string, SavedLogin>;
  options?: {
    /** Fallback timeout for steps without `timeoutMs`. */
    defaultStepTimeoutMs?: number;
    /** Screen size / device emulation for every session [G-03]. */
    viewport?: ViewportSettings;
    /** Fail the step when the page logs a JS error [F-04]. */
    failOnConsoleError?: boolean;
    /** Fail the step when a request answers 4xx/5xx [F-04]. */
    failOnHttpError?: boolean;
    artifacts?: ArtifactOptions;
    /** Base folder for relative upload paths [A-11]. */
    filesDir?: string;
    /** "Chạy từ bước X": earlier top-level steps are skipped [H-03]. */
    startAtStepId?: string;
    /**
     * Stop after this top-level step: later steps are skipped and cleanup does
     * not run — e.g. to record more steps from there [K-04].
     */
    stopAfterStepId?: string;
  };
}

export interface RunOptions {
  registry: ActionRegistry;
  onEvent?: EngineEventListener;
  /** Launched browser (see `launchBrowser`); each session gets its own context. */
  browser?: Browser;
  /** Abort to cancel the run; cleanup still runs. */
  signal?: AbortSignal;
  /** Pause / step / breakpoints [H-03]. */
  debugger?: RunDebugger;
  /** Injectable clock for tests. */
  now?: () => Date;
  /**
   * Keep the browser sessions open at the end and hand them over (the caller
   * closes them) instead of closing them — e.g. to record from step X [K-04].
   */
  keepSessions?: (pages: SessionPages) => void;
}

interface Parent {
  step: Step;
  stepNo: string;
  children: StepResult[];
  /** Top-level step number, for error details. */
  topNo: number;
}

type Outcome = { result: StepResult; stop: boolean };

/** Runs a test case's steps sequentially, then its cleanup steps, streaming events. */
export async function runTestCase(request: RunRequest, options: RunOptions): Promise<RunResult> {
  return new Run(request, options).execute();
}

class Run {
  readonly #req: RunRequest;
  readonly #opts: RunOptions;
  readonly #now: () => Date;
  readonly #vars: VariableStore;
  readonly #dialogs = new DialogController();
  readonly #diagnostics: Diagnostic[] = [];
  readonly #secretFields = new Map<string, PwLocator[]>();
  readonly #defaultTimeout: number;
  /** Top-level steps before this index are skipped (run from step X). */
  readonly #startIndex: number;
  #pages = new SessionPages(undefined);
  #services!: RunServices;

  constructor(request: RunRequest, options: RunOptions) {
    this.#req = request;
    this.#opts = options;
    this.#now = options.now ?? (() => new Date());
    this.#defaultTimeout = request.options?.defaultStepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
    const startAt = request.options?.startAtStepId;
    this.#startIndex = startAt
      ? Math.max(
          0,
          request.testCase.steps.findIndex((s) => s.id === startAt),
        )
      : 0;
    const row =
      request.rowIndex === undefined ? undefined : request.dataset?.rows[request.rowIndex];
    this.#vars = new VariableStore(
      {
        env: request.env,
        suite: request.suiteVariables,
        test: request.testCase.variables,
        row,
        secrets: request.secrets,
        product: request.testCase.product,
      },
      this.#now,
    );
  }

  #emit(event: EngineEvent): void {
    try {
      this.#opts.onEvent?.(event);
    } catch {
      // A broken listener must never break the run.
    }
  }

  #mask(text: string): string {
    return maskSecrets(text, this.#vars.secretValues());
  }

  #maskDeep(value: unknown): unknown {
    if (typeof value === 'string') return this.#mask(value);
    if (Array.isArray(value)) return value.map((v) => this.#maskDeep(v));
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.#maskDeep(v)]));
    }
    return value;
  }

  #maskError(error: RunError): RunError {
    return this.#maskDeep(error) as RunError;
  }

  #log(level: LogLevel, message: string, stepId?: string): void {
    const at = this.#now().toISOString();
    const runId = this.#req.runId;
    const text = this.#mask(message);
    this.#emit(
      stepId === undefined
        ? { type: 'log', runId, level, message: text, at }
        : { type: 'log', runId, stepId, level, message: text, at },
    );
  }

  #onPage(session: string, page: Page): void {
    this.#dialogs.attach(session, page, (d) => {
      this.#vars.set('dialogMessage', d.message);
      this.#log('info', `Dialog (${d.type}) "${d.message}" → ${d.response}`);
    });
    const push = (d: Diagnostic) => {
      const masked = { ...d, message: this.#mask(d.message) };
      this.#diagnostics.push(masked);
      this.#log(
        'warn',
        `${d.kind === 'http' ? 'Request failed' : 'Page error'}: ${masked.message}`,
      );
    };
    page.on('console', (msg) => {
      // Network failures also show up as console errors: they are reported as `http` instead.
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
        push({ kind: 'console', session, message: msg.text(), url: page.url() });
      }
    });
    page.on('pageerror', (err) =>
      push({ kind: 'pageError', session, message: err.message, url: page.url() }),
    );
    page.on('response', (res) => {
      const status = res.status();
      // The browser asks for /favicon.ico on its own; a missing icon is not a page error.
      if (status >= 400 && !/\/favicon\.ico(\?|$)/.test(res.url())) {
        push({
          kind: 'http',
          session,
          message: `${status} ${res.request().method()} ${res.url()}`,
          url: res.url(),
          status,
        });
      }
    });
  }

  async execute(): Promise<RunResult> {
    const { runId, testCase } = this.#req;
    const runSignal = this.#opts.signal ?? new AbortController().signal;
    const artifactsOpt = this.#req.options?.artifacts;
    const runStarted = this.#now();
    this.#emit({
      type: 'runStart',
      runId,
      testCaseId: testCase.id,
      at: runStarted.toISOString(),
      stepCount: testCase.steps.length,
    });

    const steps: StepResult[] = [];
    const cleanup: StepResult[] = [];
    const runArtifacts: ArtifactRef[] = [];
    let status: RunStatus = 'passed';
    let runError: RunError | undefined;

    try {
      if (artifactsOpt) await mkdir(artifactsOpt.dir, { recursive: true });
      let video = artifactsOpt?.video === true && this.#opts.browser !== undefined;
      if (video) {
        try {
          await ensureFfmpeg();
        } catch (err) {
          video = false;
          this.#log(
            'warn',
            `Video recording is off: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      this.#pages = new SessionPages(this.#opts.browser, {
        ...(this.#req.options?.viewport ? { viewport: this.#req.options.viewport } : {}),
        proxy: proxyFor(this.#req.env, this.#req.secrets),
        videoDir: video && artifactsOpt ? join(artifactsOpt.dir, 'video') : undefined,
        traceDir: artifactsOpt?.trace ? artifactsOpt.dir : undefined,
        onPage: (session, page) => this.#onPage(session, page),
      });
      this.#services = this.#makeServices();

      await this.#runList(testCase.steps, 'steps', runSignal, undefined, steps);

      // Cleanup always runs [D-05], even after a failure or cancel, with its own signal —
      // except when stopping early to keep the pages as they are [K-04].
      if (!this.#req.options?.stopAfterStepId)
        await this.#runList(
          testCase.cleanup,
          'cleanup',
          new AbortController().signal,
          undefined,
          cleanup,
          true,
        );

      if (runSignal.aborted) status = 'cancelled';
      else if (anyFailed([...steps, ...cleanup])) status = 'failed';
    } catch (err) {
      status = 'error';
      runError = this.#maskError(toRunError(err, 'ENGINE_ERROR'));
      this.#log('error', runError.message);
    } finally {
      const keep = this.#opts.keepSessions;
      if (keep) {
        try {
          keep(this.#pages);
        } catch {
          // The caller's problem; the run result still comes back.
        }
      }
      for (const a of keep ? [] : await this.#pages.closeAll()) {
        if (!artifactsOpt) continue;
        const ref: ArtifactRef = { kind: a.kind, path: relative(artifactsOpt.dir, a.path) };
        runArtifacts.push(ref);
        this.#emit({ type: 'artifact', runId, artifact: ref });
      }
    }

    const result: RunResult = {
      runId,
      testCaseId: testCase.id,
      ...(this.#req.rowIndex === undefined ? {} : { rowIndex: this.#req.rowIndex }),
      status,
      startedAt: runStarted.toISOString(),
      durationMs: Math.max(0, this.#now().getTime() - runStarted.getTime()),
      steps,
      cleanup,
      ...(runError ? { error: runError } : {}),
      artifacts: runArtifacts,
      diagnostics: [...this.#diagnostics],
    };
    this.#emit({ type: 'runEnd', runId, result });
    return result;
  }

  #makeServices(): RunServices {
    const req = this.#req;
    const logins = new Map(Object.entries(req.savedLogins ?? {}));
    const shared = new Map((req.sharedSteps ?? []).map((s) => [s.id, s]));
    const baseUrl = mainAppUrl(req.env, req.testCase.product);
    return {
      testCase: req.testCase,
      env: req.env,
      secrets: req.secrets ?? {},
      dataset: req.dataset,
      sharedSteps: shared,
      pages: this.#pages,
      dialogs: this.#dialogs,
      diagnostics: this.#diagnostics,
      filesDir: req.options?.filesDir,
      url: (value) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(value) || !baseUrl) return value;
        return new URL(value, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
      },
      savedLogins: {
        get: (name) => logins.get(name),
        save: (name, login) => {
          logins.set(name, login);
          this.#emit({ type: 'loginSaved', runId: req.runId, name, login });
        },
      },
      now: () => this.#now(),
    };
  }

  /**
   * Runs a list of steps. Returns the first hard failure (if any) so a parent
   * step can fail with it. `runAll`: keep going after hard failures (cleanup).
   */
  async #runList(
    list: readonly Step[],
    phase: StepPhase,
    signal: AbortSignal,
    parent: Parent | undefined,
    out: StepResult[],
    runAll = false,
  ): Promise<RunError | undefined> {
    let stopped = false;
    let firstHard: RunError | undefined;
    for (const [index, step] of list.entries()) {
      const outcome: Outcome = stopped
        ? { result: this.#skipped(step), stop: true }
        : await this.#runOne(step, index, phase, signal, parent);
      out.push(outcome.result);
      this.#emit({
        type: 'stepEnd',
        runId: this.#req.runId,
        phase,
        index,
        result: outcome.result,
        ...(parent ? { parentStepId: parent.step.id } : {}),
      });
      if (outcome.stop && !runAll) {
        stopped = true;
        if (outcome.result.error && !firstHard) firstHard = outcome.result.error;
      }
      if (!parent && phase === 'steps' && step.id === this.#req.options?.stopAfterStepId)
        stopped = true;
    }
    return firstHard;
  }

  #skipped(step: Step, error?: RunError): StepResult {
    return {
      stepId: step.id,
      session: step.session,
      status: 'skipped',
      soft: false,
      startedAt: this.#now().toISOString(),
      durationMs: 0,
      artifacts: [],
      ...(error ? { error } : {}),
    };
  }

  async #runOne(
    step: Step,
    index: number,
    phase: StepPhase,
    signal: AbortSignal,
    parent: Parent | undefined,
  ): Promise<Outcome> {
    if (!step.enabled) return { result: this.#skipped(step), stop: false };
    if (signal.aborted) {
      return {
        result: this.#skipped(step, { code: 'RUN_CANCELLED', message: 'Run was cancelled' }),
        stop: true,
      };
    }

    if (!parent && phase === 'steps' && index < this.#startIndex) {
      return { result: this.#skipped(step), stop: false };
    }

    const stepNo = parent ? `${parent.stepNo}.${index + 1}` : `${index + 1}`;
    const topNo = parent ? parent.topNo : index + 1;
    if (this.#opts.debugger) {
      await this.#opts.debugger.beforeStep(
        { stepId: step.id, stepNo, phase, ...(parent ? { parentStepId: parent.step.id } : {}) },
        signal,
      );
      if (signal.aborted) {
        return {
          result: this.#skipped(step, { code: 'RUN_CANCELLED', message: 'Run was cancelled' }),
          stop: true,
        };
      }
    }
    const started = this.#now();
    const startMs = performance.now();
    this.#emit({
      type: 'stepStart',
      runId: this.#req.runId,
      stepId: step.id,
      phase,
      index,
      session: step.session,
      at: started.toISOString(),
      stepNo,
      ...(parent ? { parentStepId: parent.step.id } : {}),
    });

    const self: Parent = { step, stepNo, children: [], topNo };
    const diagStart = this.#diagnostics.length;
    let lastLocator: PwLocator | undefined;
    let error: RunError | undefined;
    let cancelled = false;
    let skipped = false;
    let container = false;

    try {
      const action = this.#opts.registry.get(step.action);
      container = action?.container === true;
      const run = await this.#executeStep(step, stepNo, topNo, signal, self, (l) => {
        lastLocator = l;
      });
      skipped = run === 'skipped';
      if (!skipped && !container) this.#checkDiagnostics(diagStart, topNo, stepNo);
    } catch (err) {
      error = this.#maskError(toRunError(err));
      cancelled = error.code === 'RUN_CANCELLED';
    }

    const status: StepResult['status'] =
      cancelled || skipped ? 'skipped' : error ? 'failed' : 'passed';
    const artifacts: ArtifactRef[] = [];
    const shot = this.#req.options?.artifacts;
    const policy = shot?.screenshots ?? 'onFailure';
    if (
      shot &&
      !container &&
      !skipped &&
      !cancelled &&
      (policy === 'always' || (policy === 'onFailure' && status === 'failed'))
    ) {
      const ref = await this.#screenshot(step.session, stepNo, status, lastLocator);
      if (ref) {
        artifacts.push(ref);
        this.#emit({ type: 'artifact', runId: this.#req.runId, stepId: step.id, artifact: ref });
      }
    }

    const result: StepResult = {
      stepId: step.id,
      session: step.session,
      status,
      soft: error !== undefined && !cancelled && step.mode === 'soft',
      startedAt: started.toISOString(),
      durationMs: Math.max(0, performance.now() - startMs),
      artifacts,
      ...(error ? { error } : {}),
      ...(self.children.length > 0 ? { children: self.children } : {}),
    };
    if (error) this.#log(cancelled ? 'warn' : 'error', error.message, step.id);
    return { result, stop: cancelled || (error !== undefined && step.mode === 'hard') };
  }

  #checkDiagnostics(from: number, topNo: number, stepNo: string): void {
    const fresh = this.#diagnostics.slice(from);
    const o = this.#req.options;
    const js = fresh.find((d) => d.kind !== 'http');
    if (o?.failOnConsoleError && js) {
      throw new EngineError(
        'CONSOLE_ERROR',
        `Step ${stepNo}: the page reported an error: ${js.message}`,
        {
          step: topNo,
          stepNo,
          message: js.message,
        },
      );
    }
    const http = fresh.find((d) => d.kind === 'http');
    if (o?.failOnHttpError && http) {
      throw new EngineError('HTTP_ERROR', `Step ${stepNo}: request failed: ${http.message}`, {
        step: topNo,
        stepNo,
        status: http.status,
        url: http.url,
      });
    }
  }

  async #screenshot(
    session: string,
    stepNo: string,
    status: string,
    highlight: PwLocator | undefined,
  ): Promise<ArtifactRef | undefined> {
    const dir = this.#req.options?.artifacts?.dir;
    if (!dir || !this.#pages.isOpen(session)) return undefined;
    try {
      const page = await this.#pages.page(session);
      const path = join(dir, `step-${stepNo.replace(/\./g, '_')}-${status}.png`);
      // Red frame around the element the step worked on [I-02].
      const restore = highlight
        ? await highlight
            .evaluate(
              (el) => {
                const h = el as HTMLElement;
                const prev = h.style.outline;
                const prevOffset = h.style.outlineOffset;
                h.style.outline = '3px solid #E5484D';
                h.style.outlineOffset = '2px';
                return { prev, prevOffset };
              },
              undefined,
              { timeout: 1000 },
            )
            .catch(() => undefined)
        : undefined;
      const secrets = this.#vars.secretValues().slice(0, 20);
      await page.screenshot({
        path,
        timeout: 5000,
        mask: [
          ...(this.#secretFields.get(session) ?? []),
          ...secrets.map((s) => page.getByText(s)),
        ],
        maskColor: '#1F2A5C',
      });
      if (highlight && restore) {
        await highlight
          .evaluate(
            (el, r) => {
              (el as HTMLElement).style.outline = r.prev;
              (el as HTMLElement).style.outlineOffset = r.prevOffset;
            },
            restore,
            { timeout: 1000 },
          )
          .catch(() => undefined);
      }
      return { kind: 'screenshot', path: basename(path) };
    } catch (err) {
      this.#log(
        'warn',
        `Could not take a screenshot: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  /** Validates params, then runs the action racing a timeout and the run's cancel signal. */
  async #executeStep(
    step: Step,
    stepNo: string,
    topNo: number,
    runSignal: AbortSignal,
    self: Parent,
    onResolved: (l: PwLocator) => void,
  ): Promise<'done' | 'skipped'> {
    const action = this.#opts.registry.get(step.action);
    if (!action) {
      throw new EngineError('UNKNOWN_ACTION', `Step ${stepNo}: unknown action "${step.action}"`, {
        step: topNo,
        stepNo,
        action: step.action,
      });
    }

    const timeoutMs = step.timeoutMs ?? this.#defaultTimeout;
    const deadline = performance.now() + timeoutMs;
    const controller = new AbortController();
    const remainingMs = () => Math.max(0, Math.floor(deadline - performance.now()));
    const log: ActionContext['log'] = (message, level) =>
      this.#log(level ?? 'info', message, step.id);

    const ctx: ActionContext = {
      step,
      stepNo,
      session: step.session,
      timeoutMs,
      signal: controller.signal,
      remainingMs,
      log,
      page: () => this.#pages.page(step.session),
      context: () => this.#pages.context(step.session),
      vars: this.#vars,
      run: this.#services,
      resolve: async (target, opts) => {
        const { locator, name } = toLocator(target, this.#req.testCase.elements);
        const page = await this.#pages.page(step.session);
        const resolved: ResolvedLocator = await resolveLocator(
          () => [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())],
          this.#vars.interpolate(locator),
          {
            // Stop a bit before the step timeout so "not found" (clearer) wins over "timeout".
            timeoutMs:
              opts?.timeoutMs ??
              (action.container ? this.#defaultTimeout : Math.max(0, remainingMs() - 150)),
            signal: controller.signal,
            ...(opts?.state ? { state: opts.state } : {}),
            ...(name === undefined ? {} : { name }),
          },
        ).catch((err: unknown) => {
          if (err instanceof EngineError && err.details) err.details.step = topNo;
          if (err instanceof EngineError && err.details) err.details.stepNo = stepNo;
          throw err;
        });
        onResolved(resolved.locator);
        return resolved;
      },
      runSteps: async (raw, frame) => {
        const children = raw.map((s) =>
          StepSchema.parse({ session: step.session, ...(s as object) }),
        );
        const run = () => this.#runList(children, 'steps', controller.signal, self, self.children);
        const failed = frame ? await this.#vars.withFrame(frame, run) : await run();
        if (controller.signal.aborted && runSignal.aborted) {
          throw new EngineError('RUN_CANCELLED', 'Run was cancelled', { step: topNo });
        }
        if (failed) throw new StepFailure(failed);
      },
      markSecret: (l) => {
        const list = this.#secretFields.get(step.session) ?? [];
        list.push(l);
        this.#secretFields.set(step.session, list);
      },
    };

    // Conditional skip [D-06].
    if (step.skipIf) {
      const cond = this.#vars.interpolate(step.skipIf);
      if (await evaluateCondition(cond, ctx)) {
        log('Skipped: condition met');
        return 'skipped';
      }
    }

    let params: unknown;
    try {
      params = this.#vars.interpolate(step.params, action.rawParams ?? []);
    } catch (err) {
      if (err instanceof EngineError) {
        throw new EngineError(err.code, `Step ${stepNo}: ${err.message}`, {
          ...err.details,
          step: topNo,
          stepNo,
        });
      }
      throw err;
    }
    const parsed = action.params.safeParse(params);
    if (!parsed.success) {
      throw new EngineError('INVALID_PARAMS', `Step ${stepNo}: invalid parameters`, {
        step: topNo,
        stepNo,
        action: step.action,
        issues: parsed.error.issues.map((i: z.core.$ZodIssue) => ({
          path: i.path.map(String),
          message: i.message,
        })),
      });
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let onCancel: (() => void) | undefined;
    const guard = new Promise<never>((_, reject) => {
      if (!action.container) {
        timer = setTimeout(() => {
          const err = new EngineError(
            'STEP_TIMEOUT',
            `Step ${stepNo}: did not finish within ${timeoutMs / 1000} seconds`,
            {
              step: topNo,
              stepNo,
              timeoutMs,
            },
          );
          controller.abort(err);
          reject(err);
        }, timeoutMs);
      }
      onCancel = () => {
        const err = new EngineError('RUN_CANCELLED', 'Run was cancelled', { step: topNo });
        controller.abort(err);
        reject(err);
      };
      if (runSignal.aborted) onCancel();
      else runSignal.addEventListener('abort', onCancel, { once: true });
    });
    guard.catch(() => undefined);

    try {
      await Promise.race([Promise.resolve().then(() => action.execute(parsed.data, ctx)), guard]);
    } catch (err) {
      // Give errors from the action a step number for messages.
      if (err instanceof EngineError && err.details && err.details.step === undefined) {
        err.details.step = topNo;
        err.details.stepNo = stepNo;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (onCancel) runSignal.removeEventListener('abort', onCancel);
    }
    return 'done';
  }
}

function anyFailed(results: readonly StepResult[]): boolean {
  return results.some(
    (r) => r.status === 'failed' || (r.children !== undefined && anyFailed(r.children)),
  );
}

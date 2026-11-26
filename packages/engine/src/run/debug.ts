import type { PopupRule, RunError, Step, TestCase } from '@kiemi/schema';
import type { BrowserContext, Page } from 'playwright-core';
import type { StepPhase } from '../events';

/** Step about to run, as seen by a debugger. */
export interface StepGate {
  stepId: string;
  stepNo: string;
  phase: StepPhase;
  /** Session (browser context) the step works in. */
  session: string;
  parentStepId?: string | undefined;
}

/** The run's open browser, handed over while it waits (Pick / Highlight on the real page) [FX-03]. */
export interface LiveSessions {
  context(session: string): Promise<BrowserContext>;
  /** Active tab of the session. */
  page(session: string): Promise<Page>;
}

/** Awaited before every step; resolve to let the step run [H-03]. */
export interface RunDebugger {
  beforeStep(step: StepGate, signal: AbortSignal, live?: LiveSessions): Promise<void>;
  /**
   * Awaited when a step has failed, the browser still open [FX-01, FX-05]:
   * `retry` runs it again · `skip` marks it skipped and goes on · `continue`
   * keeps the failure on record but runs the next steps · `stop` ends the test.
   */
  afterFail?(
    step: StepGate,
    error: RunError,
    signal: AbortSignal,
    live?: LiveSessions,
  ): Promise<FailDecision>;
  /** Step edited while the run waited — used instead of the planned one [FX-02]. */
  stepEdit?(stepId: string): Step | undefined;
  /** Steps added around `stepId` while the run waited; taken once [FX-04]. */
  takeInserted?(stepId: string, where: 'before' | 'after'): Step[];
  hasInserted?(stepId: string, where: 'before' | 'after'): boolean;
  /** Popup rules changed while the run waited [FX-06]. */
  popupRulesEdit?(): PopupRule[] | undefined;
  /** Elements edited while the run waited (re-picked) [FX-03]. */
  elementsEdit?(): TestCase['elements'] | undefined;
}

export type FailDecision = 'retry' | 'skip' | 'continue' | 'stop';

export interface DebugListener {
  /** `error` is set when the pause is on a failed step [FX-01]. */
  onPause?(step: StepGate, error?: RunError): void;
  onResume?(step: StepGate): void;
}

/**
 * Pause / resume / step-over / breakpoints for a run [H-03, S-03].
 * - `pause()`: stops before the next step.
 * - `step()`: while paused, runs exactly one step then pauses again.
 * - Breakpoints: step ids that pause the run before they start.
 * Cleanup steps never pause (they must always run).
 */
export class DebugController implements RunDebugger {
  #breakpoints = new Set<string>();
  #pauseRequested = false;
  #stepping = false;
  #release: (() => void) | undefined;
  #paused: StepGate | undefined;
  #pauseOnFail: boolean;
  #runTo: string | undefined;
  #failDecision: ((d: FailDecision) => void) | undefined;
  #failed: { step: StepGate; error: RunError } | undefined;
  #live: LiveSessions | undefined;
  readonly #stepEdits = new Map<string, Step>();
  readonly #inserts = new Map<string, Step[]>();
  #elementEdits: TestCase['elements'] | undefined;
  #popupRules: PopupRule[] | undefined;
  readonly #listener: DebugListener;

  constructor(
    options: {
      breakpoints?: Iterable<string>;
      pauseAtStart?: boolean;
      pauseOnFail?: boolean;
    } = {},
    listener: DebugListener = {},
  ) {
    this.#breakpoints = new Set(options.breakpoints ?? []);
    this.#pauseRequested = options.pauseAtStart === true;
    this.#pauseOnFail = options.pauseOnFail === true;
    this.#listener = listener;
  }

  get paused(): StepGate | undefined {
    return this.#paused;
  }

  /** Failed step waiting for a decision [FX-01]. */
  get failed(): { step: StepGate; error: RunError } | undefined {
    return this.#failed;
  }

  /** Browser sessions while paused (else undefined) [FX-03]. */
  get live(): LiveSessions | undefined {
    return this.#paused ? this.#live : undefined;
  }

  /** The tester edited a step while paused [FX-02]. */
  editStep(step: Step): void {
    this.#stepEdits.set(step.id, step);
  }

  editPopupRules(rules: PopupRule[]): void {
    this.#popupRules = rules;
  }

  popupRulesEdit(): PopupRule[] | undefined {
    return this.#popupRules;
  }

  editElements(elements: TestCase['elements']): void {
    this.#elementEdits = elements;
  }

  /** Adds steps to run right before / after `stepId` in this run [FX-04]. */
  insert(stepId: string, where: 'before' | 'after', steps: Step[]): void {
    const cur = this.#inserts.get(`${where}:${stepId}`) ?? [];
    this.#inserts.set(`${where}:${stepId}`, [...cur, ...steps]);
  }

  takeInserted(stepId: string, where: 'before' | 'after'): Step[] {
    const key = `${where}:${stepId}`;
    const list = this.#inserts.get(key) ?? [];
    this.#inserts.delete(key);
    return list;
  }

  hasInserted(stepId: string, where: 'before' | 'after'): boolean {
    return (this.#inserts.get(`${where}:${stepId}`)?.length ?? 0) > 0;
  }

  stepEdit(stepId: string): Step | undefined {
    return this.#stepEdits.get(stepId);
  }

  elementsEdit(): TestCase['elements'] | undefined {
    return this.#elementEdits;
  }

  setPauseOnFail(on: boolean): void {
    this.#pauseOnFail = on;
  }

  /** Runs until `stepId` (exclusive), then pauses there — "run to here" [FX-05]. */
  runTo(stepId: string): void {
    this.#runTo = stepId;
    this.resume();
  }

  /** Answers a failed-step pause. No-op when nothing failed. */
  decide(decision: FailDecision): void {
    this.#failDecision?.(decision);
  }

  setBreakpoints(ids: Iterable<string>): void {
    this.#breakpoints = new Set(ids);
  }

  pause(): void {
    this.#pauseRequested = true;
  }

  resume(): void {
    if (this.#failDecision) {
      this.decide('continue');
      return;
    }
    this.#pauseRequested = false;
    this.#stepping = false;
    this.#release?.();
  }

  /** Runs the next step, then pauses again. */
  step(): void {
    if (this.#failDecision) {
      this.decide('retry');
      return;
    }
    this.#stepping = true;
    this.#release?.();
  }

  async beforeStep(step: StepGate, signal: AbortSignal, live?: LiveSessions): Promise<void> {
    if (step.phase === 'cleanup' || signal.aborted) return;
    const shouldPause =
      this.#pauseRequested ||
      this.#stepping ||
      this.#breakpoints.has(step.stepId) ||
      this.#runTo === step.stepId;
    if (!shouldPause) return;
    this.#stepping = false;
    this.#pauseRequested = false;
    if (this.#runTo === step.stepId) this.#runTo = undefined;
    this.#paused = step;
    this.#live = live;
    this.#listener.onPause?.(step);
    await new Promise<void>((resolve) => {
      const done = () => {
        signal.removeEventListener('abort', done);
        this.#release = undefined;
        resolve();
      };
      this.#release = done;
      signal.addEventListener('abort', done);
    });
    this.#paused = undefined;
    this.#listener.onResume?.(step);
  }

  async afterFail(
    step: StepGate,
    error: RunError,
    signal: AbortSignal,
    live?: LiveSessions,
  ): Promise<FailDecision> {
    if (!this.#pauseOnFail || step.phase === 'cleanup' || signal.aborted) return 'stop';
    this.#paused = step;
    this.#live = live;
    this.#failed = { step, error };
    this.#listener.onPause?.(step, error);
    const decision = await new Promise<FailDecision>((resolve) => {
      const done = (d: FailDecision) => {
        signal.removeEventListener('abort', onAbort);
        this.#failDecision = undefined;
        resolve(d);
      };
      const onAbort = () => done('stop');
      this.#failDecision = done;
      signal.addEventListener('abort', onAbort);
    });
    this.#paused = undefined;
    this.#failed = undefined;
    this.#listener.onResume?.(step);
    return decision;
  }
}

import type { RunError } from '@kiemi/schema';
import type { StepPhase } from '../events';

/** Step about to run, as seen by a debugger. */
export interface StepGate {
  stepId: string;
  stepNo: string;
  phase: StepPhase;
  parentStepId?: string | undefined;
}

/** Awaited before every step; resolve to let the step run [H-03]. */
export interface RunDebugger {
  beforeStep(step: StepGate, signal: AbortSignal): Promise<void>;
  /**
   * Awaited when a step has failed, the browser still open [FX-01, FX-05]:
   * `retry` runs it again · `skip` marks it skipped and goes on · `continue`
   * keeps the failure on record but runs the next steps · `stop` ends the test.
   */
  afterFail?(step: StepGate, error: RunError, signal: AbortSignal): Promise<FailDecision>;
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

  async beforeStep(step: StepGate, signal: AbortSignal): Promise<void> {
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

  async afterFail(step: StepGate, error: RunError, signal: AbortSignal): Promise<FailDecision> {
    if (!this.#pauseOnFail || step.phase === 'cleanup' || signal.aborted) return 'stop';
    this.#paused = step;
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

import type { RunError, Step } from '@kiemi/schema';
import type { BrowserContext, Page, Locator as PwLocator } from 'playwright-core';
import type { z } from 'zod';
import { EngineError } from './errors';
import type { LogLevel } from './events';
import type { ResolvedLocator } from './locator/resolve';
import type { RunServices } from './run/services';
import type { TargetParam } from './run/target';
import type { VariableStore } from './vars/store';

/** Another tab / session to look in instead of the step's own page [V-03]. */
export interface Place {
  session?: string | undefined;
  tab?: string | undefined;
}

/** What an action receives while it runs. */
export interface ActionContext {
  readonly step: Step;
  /** Step number shown to testers: `5`, or `5.2` for a nested step. */
  readonly stepNo: string;
  /** Session (browser context) this step runs in [F-01]. */
  readonly session: string;
  /** Effective timeout for this step in milliseconds [D-07]. */
  readonly timeoutMs: number;
  /** Aborted when the step times out or the run is cancelled. */
  readonly signal: AbortSignal;
  /** Milliseconds left before this step times out (≥ 0). */
  remainingMs(): number;
  log(message: string, level?: LogLevel): void;
  /** Active page of this step's session (context created on first use). */
  page(): Promise<Page>;
  /** Browser context of this step's session (own cookies/storage). */
  context(): Promise<BrowserContext>;
  /** Run variables [E-01, E-02]. */
  readonly vars: VariableStore;
  /** Run-wide services (test case, env, sessions, dialogs…). */
  readonly run: RunServices;
  /**
   * Finds the element a target points at in the active page, searching every
   * frame [A-15, C-01]. Waits up to the step's remaining time.
   */
  resolve(
    target: TargetParam,
    options?: { state?: 'visible' | 'attached'; timeoutMs?: number; at?: Place },
  ): Promise<ResolvedLocator>;
  /** Runs nested steps (if/else, loops, shared steps) as children of this step. */
  runSteps(steps: readonly unknown[], frame?: Record<string, unknown>): Promise<void>;
  /** Runs every nested step even when one fails; returns the failures [V-07]. */
  runAllSteps(steps: readonly unknown[]): Promise<{ stepId: string; error: RunError }[]>;
  /** Marks a field that holds a secret so screenshots mask it [E-08]. */
  markSecret(locator: PwLocator): void;
}

export interface ActionUi {
  /** i18n key of the action label shown in the step table. */
  label: string;
  /** Lucide icon name. */
  icon: string;
  /** Group in the "add step" menu, e.g. `navigation`, `input`, `assert`. */
  group: string;
}

export interface ActionDefinition<P extends z.ZodType = z.ZodType> {
  type: string;
  params: P;
  ui: ActionUi;
  /** Top-level param keys holding nested steps: not interpolated up front. */
  rawParams?: readonly string[];
  /**
   * Container steps (if/loop/call/waitUntil) are not limited by the step
   * timeout; their children have their own.
   */
  container?: boolean;
  /**
   * The step may create/change/delete data (raw params, before variables).
   * Refused on protected environments such as Production [W-10].
   */
  writes?: (params: Record<string, unknown>) => boolean;
  execute(params: z.output<P>, ctx: ActionContext): Promise<void> | void;
}

/** Declares an action plugin; `params` drives both validation and the generated UI form. */
export function defineAction<P extends z.ZodType>(def: ActionDefinition<P>): ActionDefinition<P> {
  return def;
}

// biome-ignore lint/suspicious/noExplicitAny: registry stores actions with heterogeneous param schemas.
type AnyAction = ActionDefinition<any>;

export class ActionRegistry {
  readonly #actions = new Map<string, AnyAction>();

  constructor(actions: readonly AnyAction[] = []) {
    for (const a of actions) this.register(a);
  }

  register(action: AnyAction): this {
    if (this.#actions.has(action.type)) {
      throw new EngineError('ENGINE_ERROR', `Action "${action.type}" is already registered`, {
        action: action.type,
      });
    }
    this.#actions.set(action.type, action);
    return this;
  }

  has(type: string): boolean {
    return this.#actions.has(type);
  }

  get(type: string): AnyAction | undefined {
    return this.#actions.get(type);
  }

  list(): AnyAction[] {
    return [...this.#actions.values()];
  }
}

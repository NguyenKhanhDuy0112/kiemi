import type {
  DownloadProgress,
  EngineEvent,
  LaunchSettingsInput,
  RunRequest,
  SavedLogin,
} from '@kiemi/engine';
import type { HighlightResult, StepChange, Suggestion } from '@kiemi/recorder';
import type { Env, Locator, RunError, RunResult, Secrets, Step, TestCase } from '@kiemi/schema';

/** Step / elements edited, or steps added, while the run waits [FX-02, FX-03, FX-04]. */
export interface EditCommand {
  type: 'edit';
  step?: Step | undefined;
  elements?: TestCase['elements'] | undefined;
  /** Steps to run next to `stepId` in this run only. */
  insert?: { stepId: string; where: 'before' | 'after'; steps: Step[] } | undefined;
}

/** Starts a recording (or a Pick-only "inspect" session) [K-01, C-06]. */
export interface RecordStart {
  type: 'record';
  launch: { settings: LaunchSettingsInput; browsersPath: string };
  /** Page to open first (absolute). Omitted when continuing after `prefix`. */
  url?: string;
  /** URLs under it are stored relative. */
  baseUrl?: string;
  session: string;
  env?: Env;
  secrets: Secrets;
  /** Steps run first, the browser kept as they leave it — "record from step X" [K-04]. */
  prefix?: RunRequest;
  /** In-page strings (`recorder.*`). */
  strings: Record<string, string>;
  /** false = Pick / Highlight only. */
  capture: boolean;
}

/** What the tester or the app asks of a running recording. */
export type RecordCommand =
  | { kind: 'stop' }
  | { kind: 'pick'; requestId: string }
  | { kind: 'highlight'; requestId: string; locator: Locator }
  | { kind: 'suggestion'; id: string; accept: boolean };

/**
 * Messages between the main process and the engine utility process [N-05].
 * Plain structured-cloneable data only (no functions, no class instances).
 */
export type HostToWorker =
  | {
      type: 'start';
      /** One request per test case / dataset row, run one after another. */
      requests: RunRequest[];
      launch: { settings: LaunchSettingsInput; browsersPath: string };
      /** Stop the remaining tests after the first one that does not pass [H-04]. */
      stopOnFailure?: boolean;
      /** Breakpoints (step ids) and "pause before the first step" [H-03]. */
      debug?: { breakpoints?: string[]; pauseAtStart?: boolean; pauseOnFail?: boolean };
    }
  | { type: 'cancel' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'step' }
  | { type: 'breakpoints'; stepIds: string[] }
  /** Answer to a step that failed and is waiting [FX-01, FX-05]. */
  | { type: 'decide'; decision: 'retry' | 'skip' | 'continue' | 'stop' }
  /** Run until this step, then pause before it [FX-05]. */
  | { type: 'runTo'; stepId: string }
  /** Step / elements edited while the run waits [FX-02, FX-03]. */
  | EditCommand
  /** Pick / Highlight on the page of the paused run [FX-03]. */
  /** Record what the tester does on the paused page; `stop` answers with the steps [FX-04]. */
  | { type: 'liveRecordStart'; strings: Record<string, string> }
  | { type: 'liveRecordStop'; requestId: string }
  | { type: 'livePick'; requestId: string; strings: Record<string, string> }
  | {
      type: 'liveHighlight';
      requestId: string;
      locator: Locator;
      strings: Record<string, string>;
    }
  | RecordStart
  | { type: 'recordCommand'; command: RecordCommand };

export type WorkerToHost =
  | { type: 'ready' }
  | { type: 'download'; progress: DownloadProgress }
  | { type: 'event'; event: EngineEvent }
  /** Paused before a step, or running again [H-03]. */
  | {
      type: 'debug';
      state: 'paused' | 'running';
      runCaseId: string;
      stepId: string;
      stepNo: string;
      /** Set when paused on a failed step [FX-01]. */
      error?: RunError;
    }
  /** All requests finished (each one's result also came as a `runEnd` event). */
  | { type: 'done'; results: RunResult[] }
  /** The run could not start or stopped outside a test case (e.g. browser launch). */
  | { type: 'fatal'; error: RunError }
  /** Recording: browser open and listening. `prefix` = result of the steps run first. */
  | { type: 'recordReady'; prefix?: RunResult }
  | { type: 'recordChanges'; changes: StepChange[] }
  | { type: 'recordSuggestions'; list: Suggestion[] }
  /** "Dừng" pressed on the in-page toolbar. */
  | { type: 'recordStopRequest' }
  /** Saved from the toolbar or by a prefix step — cookies: main stores them, never the UI [F-02]. */
  | { type: 'loginSaved'; name: string; login: SavedLogin }
  | { type: 'liveRecorded'; requestId: string; steps: Step[] }
  | { type: 'pickResult'; requestId: string; locator: Locator | null }
  | { type: 'highlightResult'; requestId: string; result: HighlightResult }
  /** Recording ended; the browser is closed. */
  | { type: 'recordDone'; steps: Step[] };

import type { RunOptionsInput, StartRunInput } from '@main/run/start-input';
import { trpcClient } from '@renderer/lib/trpc';
import { create } from 'zustand';
import { applyFeed, initialRun, isFinished, type LiveRun } from './run-state';

/** Options remembered between runs (per window session). */
export type RunPrefs = Omit<RunOptionsInput, 'breakpoints' | 'startAtStepId' | 'pauseAtStart'> & {
  environmentId?: string | null | undefined;
};

const BP_KEY = 'kiemi.breakpoints';
function loadBreakpoints(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(BP_KEY) ?? '{}') as Record<string, string[]>;
  } catch {
    return {};
  }
}
function saveBreakpoints(bp: Record<string, string[]>): void {
  try {
    localStorage.setItem(BP_KEY, JSON.stringify(bp));
  } catch {
    // per-viewer convenience only
  }
}

interface RunStore {
  runs: Record<string, LiveRun>;
  /** Latest run that included each test (for step icons in the editor). */
  latestByTest: Record<string, string>;
  /** Breakpoints (step ids) per test [H-03]. */
  breakpoints: Record<string, string[]>;
  prefs: RunPrefs;
  /** Starts a run and follows it. Returns the run id. */
  start(input: StartRunInput): Promise<string>;
  /** Follows a run started elsewhere (history, reload). */
  watch(runId: string): void;
  stop(runId: string): Promise<void>;
  control(runId: string, type: 'pause' | 'resume' | 'step'): Promise<void>;
  /** What to do with a failed step the run is waiting on [FX-05]. */
  decide(runId: string, decision: 'retry' | 'skip' | 'continue' | 'stop'): Promise<void>;
  runTo(runId: string, stepId: string): Promise<void>;
  toggleBreakpoint(testId: string, stepId: string, runId?: string): void;
  setPrefs(prefs: RunPrefs): void;
}

const subs = new Map<string, () => void>();

/** Live runs from the engine process [M4-01, M4-02]. */
export const useRunStore = create<RunStore>((set, get) => {
  const update = (runId: string, f: (r: LiveRun) => LiveRun) => {
    const cur = get().runs[runId];
    if (!cur) return;
    const next = f(cur);
    const latest = { ...get().latestByTest };
    for (const c of next.cases) latest[c.testCaseId] = runId;
    set({ runs: { ...get().runs, [runId]: next }, latestByTest: latest });
  };

  const follow = (runId: string) => {
    if (subs.has(runId)) return;
    if (!get().runs[runId]) set({ runs: { ...get().runs, [runId]: initialRun(runId) } });
    const sub = trpcClient.runs.events.subscribe(
      { runId },
      {
        onData: (event) => update(runId, (r) => applyFeed(r, event)),
        onComplete: () => subs.delete(runId),
        onError: () => subs.delete(runId),
      },
    );
    subs.set(runId, () => sub.unsubscribe());
  };

  return {
    runs: {},
    latestByTest: {},
    breakpoints: loadBreakpoints(),
    prefs: {},

    async start(input) {
      const { runId } = await trpcClient.runs.start.mutate(input);
      follow(runId);
      return runId;
    },

    watch: follow,

    async stop(runId) {
      const run = get().runs[runId];
      if (!run || isFinished(run.status)) return;
      update(runId, (r) => ({ ...r, stopping: true }));
      await trpcClient.runs.cancel.mutate({ runId });
    },

    async control(runId, type) {
      await trpcClient.runs.control.mutate({ runId, command: { type } });
    },

    async decide(runId, decision) {
      await trpcClient.runs.control.mutate({ runId, command: { type: 'decide', decision } });
    },

    async runTo(runId, stepId) {
      await trpcClient.runs.control.mutate({ runId, command: { type: 'runTo', stepId } });
    },

    toggleBreakpoint(testId, stepId, runId) {
      const cur = get().breakpoints[testId] ?? [];
      const list = cur.includes(stepId) ? cur.filter((x) => x !== stepId) : [...cur, stepId];
      const all = { ...get().breakpoints, [testId]: list };
      set({ breakpoints: all });
      saveBreakpoints(all);
      const run = runId ? get().runs[runId] : undefined;
      if (run && runId && !isFinished(run.status)) {
        const ids = run.cases.flatMap((c) => all[c.testCaseId] ?? []);
        void trpcClient.runs.control
          .mutate({ runId, command: { type: 'breakpoints', stepIds: [...new Set(ids)] } })
          .catch(() => undefined);
      }
    },

    setPrefs(prefs) {
      set({ prefs });
    },
  };
});

import type { TestCase } from '@kiemi/schema';
import { queryClient, trpc, trpcClient } from '@renderer/lib/trpc';
import { create } from 'zustand';
import { changedSteps } from './fix-diff';

/** One change made while fixing a run: what it was before, so it can be undone [FX-11]. */
export interface FixEntry {
  id: string;
  /** Short text for the log, already translated. */
  label: string;
  testCaseId: string;
  at: number;
  before: TestCase;
  after: TestCase;
}

interface FixState {
  byRun: Record<string, FixEntry[]>;
  push(runId: string, entry: FixEntry): void;
  pop(runId: string): FixEntry | undefined;
}

export const useRunFixes = create<FixState>((set, get) => ({
  byRun: {},
  push: (runId, entry) =>
    set({ byRun: { ...get().byRun, [runId]: [...(get().byRun[runId] ?? []), entry] } }),
  pop: (runId) => {
    const list = get().byRun[runId] ?? [];
    const last = list.at(-1);
    if (last) set({ byRun: { ...get().byRun, [runId]: list.slice(0, -1) } });
    return last;
  },
}));

/**
 * Takes back the latest fix: the test goes back to how it was, and the run (when
 * still waiting) gets the old steps and elements again [FX-11].
 */
export async function undoLastFix(runId: string): Promise<FixEntry | undefined> {
  const entry = useRunFixes.getState().pop(runId);
  if (!entry) return undefined;
  const row = await trpcClient.testCases.get.query({ id: entry.testCaseId });
  await trpcClient.testCases.save.mutate({
    id: entry.testCaseId,
    version: row.version,
    content: entry.before,
  });
  const send = (command: Parameters<typeof trpcClient.runs.control.mutate>[0]['command']) =>
    trpcClient.runs.control.mutate({ runId, command }).catch(() => undefined);
  for (const step of changedSteps(entry.before, entry.after)) await send({ type: 'edit', step });
  await send({ type: 'edit', elements: entry.before.elements });
  await queryClient.invalidateQueries({
    queryKey: trpc.testCases.get.queryKey({ id: entry.testCaseId }),
  });
  return entry;
}

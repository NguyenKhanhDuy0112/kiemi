import type { SharedStep, Step, TestCase } from '@kiemi/schema';
import type { ActionRegistry } from '../define-action';

/** A step that may change data, found before a run on a protected environment [W-10]. */
export interface WriteStep {
  stepId: string;
  action: string;
  /** `cleanup` steps always count as writes (they exist to delete/reset data). */
  reason: 'cleanup' | 'write';
}

const MAX_DEPTH = 32;

/**
 * Every step of the test (nested `if`/`loop` children and shared steps included)
 * that may write data: cleanup steps and actions whose `writes(params)` says so.
 * Disabled steps are ignored.
 */
export function findWriteSteps(
  testCase: Pick<TestCase, 'steps' | 'cleanup'>,
  registry: ActionRegistry,
  sharedSteps: readonly SharedStep[] = [],
): WriteStep[] {
  const shared = new Map(sharedSteps.map((s) => [s.id, s]));
  const out: WriteStep[] = [];
  const seen = new Set<string>();
  const walk = (list: readonly Step[], depth: number, inCleanup: boolean) => {
    if (depth > MAX_DEPTH) return;
    for (const step of list) {
      if (step.enabled === false) continue;
      if (inCleanup) {
        out.push({ stepId: step.id, action: step.action, reason: 'cleanup' });
        continue;
      }
      const def = registry.get(step.action);
      const params = (step.params ?? {}) as Record<string, unknown>;
      if (def?.writes?.(params))
        out.push({ stepId: step.id, action: step.action, reason: 'write' });
      for (const key of def?.rawParams ?? []) {
        const nested = params[key];
        if (Array.isArray(nested)) walk(nested as Step[], depth + 1, false);
      }
      if (step.action === 'call' && typeof params.shared === 'string') {
        const def2 = shared.get(params.shared);
        if (def2 && !seen.has(def2.id)) {
          seen.add(def2.id);
          walk(def2.steps, depth + 1, false);
          seen.delete(def2.id);
        }
      }
    }
  };
  walk(testCase.steps, 0, false);
  walk(testCase.cleanup, 0, true);
  return out;
}

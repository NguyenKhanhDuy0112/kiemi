import type { Step, TestCase } from '@kiemi/schema';
import { flatten } from '../editor/doc-model';

/** Steps of `before` whose content is different (or gone) in `after`, in their old form. */
export function changedSteps(before: TestCase, after: TestCase): Step[] {
  const now = new Map(flatten(after).map((r) => [r.step.id, JSON.stringify(r.step)]));
  return flatten(before)
    .filter((r) => now.get(r.step.id) !== JSON.stringify(r.step))
    .map((r) => r.step);
}

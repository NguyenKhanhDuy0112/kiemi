import type { Step } from './step';
import type { TestCase } from './test-case';

export type StepChange =
  | { kind: 'added'; id: string; after: Step }
  | { kind: 'removed'; id: string; before: Step }
  | { kind: 'changed'; id: string; before: Step; after: Step; fields: string[] }
  | { kind: 'moved'; id: string; before: Step; after: Step };

export interface TestDiff {
  nameChanged: { before: string; after: string } | null;
  /** Names of other top-level parts that differ (`variables`, `dataset`, `tags`…). */
  otherChanges: string[];
  steps: StepChange[];
  /** True when nothing differs. */
  same: boolean;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function flatten(steps: readonly Step[]): Step[] {
  return steps.flatMap((s) => {
    const nested = ['steps', 'elseSteps']
      .flatMap((k) => (Array.isArray(s.params[k]) ? (s.params[k] as Step[]) : []))
      .filter((x) => x && typeof x === 'object' && 'id' in x);
    return [s, ...flatten(nested)];
  });
}

/** Which fields of a step differ (`params.value`, `enabled`…). */
function changedFields(a: Step, b: Step): string[] {
  const out: string[] = [];
  for (const k of [
    'action',
    'session',
    'name',
    'note',
    'enabled',
    'mode',
    'tab',
    'timeoutMs',
  ] as const)
    if (!eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) out.push(k);
  const keys = new Set([...Object.keys(a.params), ...Object.keys(b.params)]);
  for (const k of keys) if (!eq(a.params[k], b.params[k])) out.push(`params.${k}`);
  return out;
}

/**
 * What changed between two versions of a test: name, steps added / removed /
 * edited / moved (matched by step id, nested steps included), other parts [T-05].
 */
export function diffTests(before: TestCase, after: TestCase): TestDiff {
  const a = flatten(before.steps);
  const b = flatten(after.steps);
  const ma = new Map(a.map((s) => [s.id, s]));
  const mb = new Map(b.map((s) => [s.id, s]));
  const steps: StepChange[] = [];
  for (const s of a) if (!mb.has(s.id)) steps.push({ kind: 'removed', id: s.id, before: s });
  for (const s of b) {
    const old = ma.get(s.id);
    if (!old) {
      steps.push({ kind: 'added', id: s.id, after: s });
      continue;
    }
    const fields = changedFields(old, s).filter(
      (f) => f !== 'params.steps' && f !== 'params.elseSteps',
    );
    if (fields.length) steps.push({ kind: 'changed', id: s.id, before: old, after: s, fields });
  }
  // Same steps in a different order.
  const common = (list: Step[], other: Map<string, Step>) =>
    list.filter((s) => other.has(s.id)).map((s) => s.id);
  const orderA = common(a, mb);
  const orderB = common(b, ma);
  if (!eq(orderA, orderB)) {
    for (const [i, id] of orderB.entries())
      if (orderA[i] !== id && !steps.some((c) => c.id === id))
        steps.push({ kind: 'moved', id, before: ma.get(id) as Step, after: mb.get(id) as Step });
  }
  const otherChanges: string[] = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (['steps', 'name', 'id', 'schemaVersion'].includes(k)) continue;
    if (!eq((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k]))
      otherChanges.push(k);
  }
  const nameChanged =
    before.name === after.name ? null : { before: before.name, after: after.name };
  return {
    nameChanged,
    otherChanges: otherChanges.sort(),
    steps,
    same: !nameChanged && otherChanges.length === 0 && steps.length === 0,
  };
}

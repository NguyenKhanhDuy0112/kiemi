import type { ManualCase, PlanItem, PlanStatus, TestPlan } from '@kiemi/schema';

const uid = (): string => crypto.randomUUID();

export const newPlan = (name: string): TestPlan => ({ id: uid(), name, release: '', items: [] });

/** Adds tests / manual cases to the round, skipping ones already in it. */
export function addItems(
  plan: TestPlan,
  picks: { kind: 'auto' | 'manual'; refId: string; name: string }[],
): TestPlan {
  const have = new Set(plan.items.map((i) => `${i.kind}:${i.refId}`));
  const fresh: PlanItem[] = [];
  for (const p of picks) {
    const key = `${p.kind}:${p.refId}`;
    if (have.has(key)) continue;
    have.add(key);
    fresh.push({
      id: uid(),
      kind: p.kind,
      refId: p.refId,
      name: p.name,
      assignee: '',
      status: 'notrun',
      note: '',
    });
  }
  return { ...plan, items: [...plan.items, ...fresh] };
}

export const patchItem = (plan: TestPlan, itemId: string, p: Partial<PlanItem>): TestPlan => ({
  ...plan,
  items: plan.items.map((i) => (i.id === itemId ? { ...i, ...p } : i)),
});

/** Gives every item that has no owner to `who`. */
export const assignUnowned = (plan: TestPlan, who: string): TestPlan => ({
  ...plan,
  items: plan.items.map((i) => (i.assignee ? i : { ...i, assignee: who })),
});

export const PLAN_STATUSES: PlanStatus[] = ['notrun', 'pass', 'fail', 'blocked'];

/** Name shown for an item: live name of the test / case, else the one stored when added. */
export function itemName(item: PlanItem, tests: Map<string, string>, manual: ManualCase[]): string {
  const live =
    item.kind === 'auto' ? tests.get(item.refId) : manual.find((c) => c.id === item.refId)?.name;
  return live ?? item.name;
}

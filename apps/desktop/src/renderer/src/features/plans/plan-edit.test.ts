import { describe, expect, it } from 'vitest';
import { addItems, assignUnowned, itemName, newPlan, patchItem } from './plan-edit';

describe('test plan editing [T-02]', () => {
  it('adds each test once and keeps names', () => {
    const p = addItems(newPlan('Đợt 1'), [
      { kind: 'auto', refId: 't1', name: 'A' },
      { kind: 'auto', refId: 't1', name: 'A' },
      { kind: 'manual', refId: 't1', name: 'B' },
    ]);
    expect(p.items.map((i) => `${i.kind}:${i.refId}`)).toEqual(['auto:t1', 'manual:t1']);
    expect(addItems(p, [{ kind: 'auto', refId: 't1', name: 'A' }]).items).toHaveLength(2);
  });
  it('assigns only items without an owner', () => {
    let p = addItems(newPlan('x'), [
      { kind: 'auto', refId: 'a', name: 'A' },
      { kind: 'auto', refId: 'b', name: 'B' },
    ]);
    p = patchItem(p, (p.items[0] as { id: string }).id, { assignee: 'An' });
    expect(assignUnowned(p, 'Bình').items.map((i) => i.assignee)).toEqual(['An', 'Bình']);
  });
  it('shows the live name, else the stored one', () => {
    const p = addItems(newPlan('x'), [{ kind: 'auto', refId: 'a', name: 'Cũ' }]);
    const it = p.items[0] as (typeof p.items)[number];
    expect(itemName(it, new Map([['a', 'Mới']]), [])).toBe('Mới');
    expect(itemName(it, new Map(), [])).toBe('Cũ');
  });
});

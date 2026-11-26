import { TestCaseSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { changedSteps } from './fix-diff';

const doc = (steps: Array<{ id: string; value: string }>) =>
  TestCaseSchema.parse({
    schemaVersion: 2,
    id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f01',
    name: 'T',
    steps: steps.map((s) => ({ id: s.id, action: 'wait', params: { seconds: s.value } })),
  });

describe('changedSteps [FX-11]', () => {
  it('returns the old form of every step that was edited or removed', () => {
    const before = doc([
      { id: 'a', value: '1' },
      { id: 'b', value: '2' },
      { id: 'c', value: '3' },
    ]);
    const after = doc([
      { id: 'a', value: '1' },
      { id: 'b', value: '9' },
    ]);
    expect(changedSteps(before, after).map((s) => s.id)).toEqual(['b', 'c']);
  });
  it('is empty when nothing changed', () => {
    const d = doc([{ id: 'a', value: '1' }]);
    expect(changedSteps(d, d)).toEqual([]);
  });
});

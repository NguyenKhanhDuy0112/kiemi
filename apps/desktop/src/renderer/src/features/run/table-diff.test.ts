import { describe, expect, it } from 'vitest';
import { diffOf } from './table-diff';

describe('diffOf [P-06]', () => {
  it('reads the diff of a failed table comparison', () => {
    expect(
      diffOf({
        diff: {
          missing: ['A'],
          extra: [],
          mismatched: [{ key: 'B', column: 'c', expected: '1', actual: '2' }],
        },
      }),
    ).toEqual({
      missing: ['A'],
      extra: [],
      mismatched: [{ key: 'B', column: 'c', expected: '1', actual: '2' }],
      duplicates: [],
    });
  });
  it('ignores other failures', () => {
    expect(diffOf(undefined)).toBeUndefined();
    expect(diffOf({ expected: 'x' })).toBeUndefined();
    expect(diffOf({ diff: { missing: 'x' } })).toBeUndefined();
  });
});

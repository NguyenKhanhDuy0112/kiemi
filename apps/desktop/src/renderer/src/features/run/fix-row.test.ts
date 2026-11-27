import { describe, expect, it } from 'vitest';
import { changedCells } from './fix-row';

describe('changedCells [FX-10]', () => {
  it('keeps only edited cells', () => {
    expect(changedCells({ a: '1', b: '2' }, { a: '1', b: '3', c: 'x' })).toEqual({
      b: '3',
      c: 'x',
    });
  });
});

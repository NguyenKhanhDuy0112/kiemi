import { describe, expect, it } from 'vitest';
import { compareObservations } from './observations';

describe('compareObservations [V-06]', () => {
  it('reports exactly the fields that differ, then one-sided ones', () => {
    const d = compareObservations(
      { gia: '100', ten: 'An', chiA: 'x' },
      { gia: '120', ten: 'An', chiB: 'y' },
    );
    expect(d.map((x) => `${x.name}:${x.status}`)).toEqual([
      'gia:different',
      'chiA:onlyA',
      'chiB:onlyB',
      'ten:same',
    ]);
  });
});

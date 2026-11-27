import { describe, expect, it } from 'vitest';
import type { Coverage } from './coverage';
import { coverageScore } from './coverage-score';

const page = (tests: number, covered: boolean[]) =>
  ({
    page: { id: 'p', name: 'p', path: '/', kind: 'form' },
    tests: Array.from({ length: tests }, (_, i) => ({ id: String(i), name: 'x' })),
    groups: covered.map((c, i) => ({ group: `g${i}`, covered: c })),
  }) as Coverage['pages'][number];

describe('coverageScore [CV-09]', () => {
  it('averages the parts that have data', () => {
    const cov = {
      pages: [page(1, [true, false]), page(0, [false, false])],
      untested: [],
      byTechnique: [],
      byQuality: [],
      unlabelled: 2,
    } as unknown as Coverage;
    expect(coverageScore(cov, 4)).toEqual({ pages: 50, checklist: 25, labels: 50, total: 42 });
  });
  it('is empty when there is nothing to measure', () => {
    const cov = {
      pages: [],
      untested: [],
      byTechnique: [],
      byQuality: [],
      unlabelled: 0,
    } as unknown as Coverage;
    expect(coverageScore(cov, 0).total).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { parseParams, planCombinations } from './combinations';

const text =
  'trinhDuyet: Chrome, Edge, Firefox, Safari\nvaiTro: nhanvien; quanly; ketoan\nngonNgu: vi, en\n\nrác';

describe('combinations dialog logic [P-08]', () => {
  it('reads one parameter per line', () => {
    expect(parseParams(text).map((p) => [p.name, p.values.length])).toEqual([
      ['trinhDuyet', 4],
      ['vaiTro', 3],
      ['ngonNgu', 2],
    ]);
  });

  it('plans the full product or a pairwise set', () => {
    expect(planCombinations(text, 'all').rows).toHaveLength(24);
    const p = planCombinations(text, 'pairwise');
    expect(p.rows.length).toBeLessThanOrEqual(12);
    expect(p.columns).toEqual(['trinhDuyet', 'vaiTro', 'ngonNgu']);
    expect(p.full).toBe(24);
  });
});

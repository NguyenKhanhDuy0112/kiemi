import { describe, expect, it } from 'vitest';
import { allCombinations, type ComboParam, fullCount, pairwiseCombinations } from './combinations';

const params: ComboParam[] = [
  { name: 'trinhDuyet', values: ['Chrome', 'Edge', 'Firefox', 'Safari'] },
  { name: 'vaiTro', values: ['nhanvien', 'quanly', 'ketoan'] },
  { name: 'ngonNgu', values: ['vi', 'en'] },
];

function pairsCovered(rows: Record<string, string>[], ps: ComboParam[]) {
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++)
      for (const a of (ps[i] as ComboParam).values)
        for (const b of (ps[j] as ComboParam).values)
          if (
            !rows.some(
              (r) => r[(ps[i] as ComboParam).name] === a && r[(ps[j] as ComboParam).name] === b,
            )
          )
            return `${a}+${b}`;
  return null;
}

describe('combinations [P-08]', () => {
  it('full product', () => {
    expect(fullCount(params)).toBe(24);
    expect(allCombinations(params)).toHaveLength(24);
  });

  it('pairwise of 4 x 3 x 2 has at most 12 rows and covers every pair', () => {
    const rows = pairwiseCombinations(params);
    expect(rows.length).toBeLessThanOrEqual(12);
    expect(pairsCovered(rows, params)).toBeNull();
  });

  it('pairwise stays much smaller on many parameters', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `p${i}`, values: ['a', 'b', 'c'] }));
    const rows = pairwiseCombinations(many);
    expect(rows.length).toBeLessThan(30);
    expect(pairsCovered(rows, many)).toBeNull();
  });

  it('ignores blank and duplicate values; refuses a huge product', () => {
    expect(allCombinations([{ name: 'a', values: ['x', ' x ', ''] }])).toEqual([{ a: 'x' }]);
    const big = Array.from({ length: 6 }, (_, i) => ({
      name: `p${i}`,
      values: Array.from({ length: 10 }, (_, k) => String(k)),
    }));
    expect(() => allCombinations(big)).toThrow();
    expect(pairwiseCombinations(big).length).toBeLessThan(200);
  });
});

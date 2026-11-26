import { describe, expect, it } from 'vitest';
import { describeDiff, diffTables, isClean } from './table-diff';

const actual = [
  { Mã: 'A1', Tên: 'Áo', Giá: '150.000 ₫' },
  { Mã: 'B2', Tên: 'Quần', Giá: '250.000 ₫' },
  { Mã: 'C3', Tên: 'Mũ', Giá: '50.000 ₫' },
];

describe('table vs expected list [P-06]', () => {
  it('ignores order and reads money as numbers', () => {
    const expected = [
      { Mã: 'C3', Giá: '50000' },
      { Mã: 'A1', Giá: 150000 },
      { Mã: 'B2', Giá: '250.000' },
    ];
    expect(isClean(diffTables(actual, expected, 'Mã'))).toBe(true);
  });

  it('reports missing, extra and differing cells', () => {
    const expected = [
      { Mã: 'A1', Tên: 'Áo', Giá: '150000' },
      { Mã: 'B2', Tên: 'Quần dài', Giá: '250000' },
      { Mã: 'D4', Tên: 'Giày', Giá: '1' },
    ];
    const d = diffTables(actual, expected, 'Mã');
    expect(d.missing).toEqual(['D4']);
    expect(d.extra).toEqual(['C3']);
    expect(d.mismatched).toEqual([
      { key: 'B2', column: 'Tên', expected: 'Quần dài', actual: 'Quần' },
    ]);
    expect(describeDiff(d)).toContain(
      'thiếu 1 (D4); thừa 1 (C3); lệch 1 (B2.Tên: Quần ≠ Quần dài)',
    );
  });

  it('compares only the chosen columns and matches column names loosely', () => {
    const d = diffTables(actual, [{ mã: 'A1', Tên: 'KHÁC', giá: '150000' }], 'Mã', ['giá']);
    expect(d.mismatched).toEqual([]);
    expect(d.extra).toEqual(['B2', 'C3']);
  });

  it('flags duplicate keys instead of guessing', () => {
    const d = diffTables([...actual, { Mã: 'A1', Tên: 'Áo 2', Giá: '1' }], actual, 'Mã');
    expect(d.duplicates).toEqual(['A1']);
  });
});

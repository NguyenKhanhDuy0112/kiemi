import { describe, expect, it } from 'vitest';
import { sortProblems, violations } from './table-rules';

const rows = [
  { Tên: 'An', Phòng: 'Kế toán', Lương: '10.000.000 ₫' },
  { Tên: 'Bình', Phòng: 'Kế toán', Lương: '12.000.000 ₫' },
  { Tên: 'Chi', Phòng: 'Nhân sự', Lương: '9.000.000 ₫' },
];

describe('every row satisfies a condition [Q-01]', () => {
  it('lists the rows that break a text condition', () => {
    expect(violations(rows, 'Phòng', 'equals', 'kế toán', undefined)).toEqual([
      { row: 3, value: 'Nhân sự' },
    ]);
    expect(violations(rows, 'phòng', 'notContains', 'Hủy', undefined)).toEqual([]);
  });
  it('and a numeric one (money is parsed)', () => {
    expect(violations(rows, 'Lương', 'gte', 10000000, undefined)).toEqual([
      { row: 3, value: '9.000.000 ₫' },
    ]);
    expect(violations(rows, 'Lương', 'between', 9000000, 12000000)).toEqual([]);
  });
});

describe('sorted by column [Q-02]', () => {
  const names = (...n: string[]) => n.map((Tên) => ({ Tên }));
  it('uses Vietnamese order: a < ă < â < b and d < đ < e', () => {
    expect(
      sortProblems(names('An', 'Ăn', 'Ân', 'Bình', 'Dũng', 'Đức', 'Em'), 'Tên', 'asc'),
    ).toEqual([]);
    const bad = sortProblems(names('An', 'Bình', 'Ăn'), 'Tên', 'asc');
    expect(bad).toEqual([{ row: 3, previous: 'Bình', value: 'Ăn' }]);
  });
  it('compares numbers by value, not as text', () => {
    const n = (...v: string[]) => v.map((Giá) => ({ Giá }));
    expect(sortProblems(n('9', '10', '1.000'), 'Giá', 'asc')).toEqual([]);
    expect(sortProblems(n('1.000', '10', '9'), 'Giá', 'desc')).toEqual([]);
    expect(sortProblems(n('9', '10', '2'), 'Giá', 'asc')).toEqual([
      { row: 3, previous: '10', value: '2' },
    ]);
  });
  it('compares dates by day (dd/MM/yyyy)', () => {
    const d = (...v: string[]) => v.map((Ngày) => ({ Ngày }));
    expect(sortProblems(d('02/01/2026', '15/01/2026', '01/02/2026'), 'Ngày', 'asc')).toEqual([]);
    expect(sortProblems(d('15/01/2026', '02/01/2026'), 'Ngày', 'asc', 'date')).toHaveLength(1);
  });
  it('finds one wrong row among 500', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ Số: String(i + 1) }));
    [many[249], many[250]] = [many[250] as { Số: string }, many[249] as { Số: string }];
    expect(sortProblems(many, 'Số', 'asc').map((p) => p.row)).toEqual([251]);
  });
});

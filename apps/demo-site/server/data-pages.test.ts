import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  netPay,
  payroll,
  payrollPdf,
  payrollXlsx,
  queryPeople,
  readUpload,
  seedPeople,
  sumOf,
  validateImport,
} from './data-pages';

describe('staff list [Q-01 → Q-03]', () => {
  const all = seedPeople();
  it('has 500 distinct rows and pages of 20', () => {
    expect(all).toHaveLength(500);
    expect(new Set(all.map((p) => p.code)).size).toBe(500);
    const r = queryPeople(all, {});
    expect(r).toMatchObject({ total: 500, totalPages: 25, page: 1 });
    expect(r.items).toHaveLength(20);
  });
  it('filters by department and by name, sorts in Vietnamese order, both directions', () => {
    const kt = queryPeople(all, { dept: 'Kế toán', pageSize: 100 });
    expect(kt.total).toBe(100);
    expect(kt.items.every((p) => p.dept === 'Kế toán')).toBe(true);
    const names = queryPeople(all, { sort: 'name', pageSize: 100 }).items.map((p) => p.name);
    const sorted = [...names].sort(new Intl.Collator('vi').compare);
    expect(names).toEqual(sorted);
    const desc = queryPeople(all, { sort: 'salary', dir: 'desc', pageSize: 5 }).items.map(
      (p) => p.salary,
    );
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    expect(queryPeople(all, { q: 'nv0007' }).total).toBe(1);
  });
  it('deliberate bugs show up only when asked', () => {
    const ok = queryPeople(all, { sort: 'code', pageSize: 100 }).items.map((p) => p.code);
    const bad = queryPeople(all, { sort: 'code', pageSize: 100, bugSort: true }).items.map(
      (p) => p.code,
    );
    expect(bad).not.toEqual(ok);
    expect(queryPeople(all, { dept: 'Kế toán', bugFilter: true }).total).toBe(101);
  });
});

describe('payroll [P-03, Q-04]', () => {
  it('nets base + allowance + bonus − 10.5% insurance', () => {
    expect(netPay(12_000_000, 1_000_000, 500_000)).toBe(12_240_000);
    const rows = payroll();
    expect(sumOf(rows, 'net')).toBe(rows.reduce((s, r) => s + r.net, 0));
  });
  it('exports an Excel with a header row and a total row', async () => {
    const rows = payroll();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await payrollXlsx(rows)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Bảng lương');
    expect(ws?.getRow(2).getCell(1).value).toBe('Họ tên');
    expect(ws?.getRow(rows.length + 3).getCell(6).value).toBe(sumOf(rows, 'net'));
  });
  it('exports a PDF', () => {
    const text = new TextDecoder().decode(payrollPdf(payroll()));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain(`Tong thuc linh: ${sumOf(payroll(), 'net')}`);
  });
});

describe('import [P-09]', () => {
  const header = ['Mã', 'Họ tên', 'Email', 'Lương'];
  it('accepts good rows and names the bad ones by file row', () => {
    const r = validateImport([
      header,
      ['A1', 'An', 'an@x.vn', '10.000.000'],
      ['A2', 'Bình', 'binh-x.vn', '12000000'],
      ['A1', 'Chi', 'chi@x.vn', '9000000'],
      ['', '', '', ''],
      ['A4', '', 'd@x.vn', '-5'],
    ]);
    expect(r.total).toBe(4);
    expect(r.imported.map((x) => x.code)).toEqual(['A1']);
    expect(r.errors).toEqual([
      { row: 3, message: 'Email không hợp lệ' },
      { row: 4, message: 'Mã A1 bị trùng' },
      { row: 6, message: 'Họ tên không được trống; Lương phải là số lớn hơn 0' },
    ]);
  });
  it('rejects a file without the needed columns', () => {
    expect(validateImport([['x'], ['1']]).errors[0]?.message).toContain('Thiếu cột');
  });
  it('reads csv and xlsx uploads', async () => {
    expect(await readUpload(new TextEncoder().encode('Mã;Họ tên\nA1;An'), 'a.csv')).toEqual([
      ['Mã', 'Họ tên'],
      ['A1', 'An'],
    ]);
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('S').addRow(['Mã', 'Lương']);
    wb.getWorksheet('S')?.addRow(['A1', 5]);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    expect(await readUpload(bytes, 'a.xlsx')).toEqual([
      ['Mã', 'Lương'],
      ['A1', '5'],
    ]);
  });
});

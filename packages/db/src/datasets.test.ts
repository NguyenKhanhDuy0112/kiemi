import { childRowsOf, type DataRow } from '@kiemi/schema';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, readCsv, writeCsv } from './io/csv';
import { excelSheets, readExcel, writeExcel } from './io/excel';
import { createMemoryServices } from './testing';

describe('CSV [E-03]', () => {
  it('parses quotes, escaped quotes, new lines in cells and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n"multi\nline",z')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
      ['multi\nline', 'z'],
    ]);
  });

  it('detects ; and tab delimiters, strips the BOM, names columns', () => {
    expect(detectDelimiter('ten;tuoi\nAn;20')).toBe(';');
    expect(detectDelimiter('ten\ttuoi')).toBe('\t');
    const t = readCsv(new TextEncoder().encode('﻿Tên;Tuổi;;Tên\nAn;20;x;An2\n;;;\nBình;30;;'));
    expect(t.columns).toEqual(['Tên', 'Tuổi', 'Cột 3', 'Tên (2)']);
    expect(t.rows).toEqual([
      { Tên: 'An', Tuổi: '20', 'Cột 3': 'x', 'Tên (2)': 'An2' },
      { Tên: 'Bình', Tuổi: '30', 'Cột 3': '', 'Tên (2)': '' },
    ]);
  });

  it('writes CSV that reads back the same', () => {
    const t = { columns: ['a', 'b'], rows: [{ a: 'x,1', b: 'say "hi"' }] };
    expect(readCsv(writeCsv(t))).toEqual(t);
  });

  it('rejects a file without header', () => {
    expect(() => readCsv('')).toThrow(/no header/);
  });
});

describe('Excel [E-03]', () => {
  it('reads text, numbers, dates, formulas and rich text as the tester sees them', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Đơn nghỉ');
    wb.addWorksheet('Khác');
    ws.addRow(['Mã', 'Số ngày', 'Từ ngày', 'Tổng', 'Ghi chú']);
    ws.addRow([
      'A1',
      2,
      new Date(Date.UTC(2026, 10, 20)),
      { formula: 'B2*2', result: 4 },
      { richText: [{ text: 'Khẩn ' }, { text: 'cấp', font: { bold: true } }] },
    ]);
    ws.addRow([]);
    ws.addRow(['B2', 1.5, null, null, null]);
    const data = new Uint8Array(await wb.xlsx.writeBuffer());
    expect(await excelSheets(data)).toEqual(['Đơn nghỉ', 'Khác']);
    const t = await readExcel(data);
    expect(t.sheet).toBe('Đơn nghỉ');
    expect(t.rows).toEqual([
      { Mã: 'A1', 'Số ngày': '2', 'Từ ngày': '20/11/2026', Tổng: '4', 'Ghi chú': 'Khẩn cấp' },
      { Mã: 'B2', 'Số ngày': '1.5', 'Từ ngày': '', Tổng: '', 'Ghi chú': '' },
    ]);
    await expect(readExcel(data, 'Không có')).rejects.toThrow(/not found/);
    await expect(readExcel(new Uint8Array([1, 2, 3]))).rejects.toThrow(/Excel/);
  });

  it('round-trips through writeExcel', async () => {
    const t = { columns: ['Tên', 'Email'], rows: [{ Tên: 'An', Email: 'an@x.vn' }] };
    expect(await readExcel(await writeExcel(t))).toMatchObject(t);
  });
});

describe('dataset service [E-03]', () => {
  it('manual tables, imports and engine shape', async () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const manual = s.datasets.create({
      projectId,
      name: 'Tay',
      columns: ['user'],
      rows: [{ user: 'an' }],
    });
    expect(manual.source).toEqual({ kind: 'manual' });
    expect(() => s.datasets.update(manual.id, { rows: [{ khac: 'x' }] })).toThrow(
      /Invalid dataset/,
    );
    const csv = s.datasets.importCsv(projectId, 'Từ CSV', 'du-lieu.csv', 'a,b\n1,2');
    expect(csv).toMatchObject({
      columns: ['a', 'b'],
      rows: [{ a: '1', b: '2' }],
      source: { kind: 'csv', fileName: 'du-lieu.csv' },
    });
    const xlsx = await s.datasets.importExcel(
      projectId,
      'Từ Excel',
      'f.xlsx',
      await writeExcel({ columns: ['x'], rows: [{ x: '1' }] }),
    );
    expect(xlsx.source).toEqual({ kind: 'excel', fileName: 'f.xlsx', sheet: 'Dữ liệu' });
    expect(s.datasets.forRun(csv.id)).toEqual({
      id: csv.id,
      name: 'Từ CSV',
      columns: ['a', 'b'],
      rows: [{ a: '1', b: '2' }],
    });
  });
});

describe('linked sheets [P-01]', () => {
  async function twoSheets(): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    const bo = wb.addWorksheet('Bo');
    bo.addRow(['maBo', 'ten']);
    bo.addRow(['B1', 'Bộ một']);
    bo.addRow(['B2', 'Bộ hai']);
    const sp = wb.addWorksheet('SanPham');
    sp.addRow(['maSp', 'maBo', 'soLuong']);
    sp.addRow(['S1', 'B1', '1']);
    sp.addRow(['S2', 'B1', '2']);
    sp.addRow(['S3', 'B2', '5']);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it('turns the other sheets into child tables linked by the shared column', async () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const ds = await s.datasets.importExcel(
      projectId,
      'Bộ',
      'b.xlsx',
      await twoSheets(),
      undefined,
      true,
    );
    expect(ds.children).toMatchObject([
      { name: 'SanPham', key: 'maBo', parentKey: 'maBo', columns: ['maSp', 'maBo', 'soLuong'] },
    ]);
    const run = s.datasets.forRun(ds.id);
    expect(childRowsOf(run, run.rows[0] as DataRow, 'SanPham')?.map((r) => r.maSp)).toEqual([
      'S1',
      'S2',
    ]);
    expect(childRowsOf(run, run.rows[1] as DataRow, 'SanPham')?.map((r) => r.maSp)).toEqual(['S3']);
    expect(childRowsOf(run, run.rows[1] as DataRow, 'Khac')).toBeUndefined();
  });

  it('without linking only the first sheet is read; a sheet with no shared column is refused', async () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const plain = await s.datasets.importExcel(projectId, 'P', 'b.xlsx', await twoSheets());
    expect(plain.children).toBeNull();
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('A').addRow(['x']);
    wb.addWorksheet('B').addRow(['y']);
    const data = new Uint8Array(await wb.xlsx.writeBuffer());
    await expect(
      s.datasets.importExcel(projectId, 'Q', 'c.xlsx', data, undefined, true),
    ).rejects.toThrow(/shares no column/);
  });

  it('rejects a link to a column that does not exist', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    expect(() =>
      s.datasets.create({
        projectId,
        name: 'X',
        columns: ['a'],
        rows: [],
        children: [{ name: 'C', key: 'k', parentKey: 'zzz', columns: ['k'], rows: [] }],
      }),
    ).toThrow(/Invalid dataset/);
  });
});

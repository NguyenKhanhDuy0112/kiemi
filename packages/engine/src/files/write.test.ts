import { describe, expect, it } from 'vitest';
import { readCsvText, readXlsx } from './read';
import { writeCsvText, writeXlsx } from './write';

const table = {
  columns: ['Mã', 'Tên', 'Ghi chú'],
  rows: [
    { Mã: 'A1', Tên: 'Áo, dài', 'Ghi chú': 'nói "hi"' },
    { Mã: 'B2', Tên: 'Quần', 'Ghi chú': '' },
  ],
};

describe('file writers [P-09]', () => {
  it('xlsx → read back the same', async () => {
    const x = await readXlsx(await writeXlsx(table, 'Nhân viên'));
    expect(x.sheet).toBe('Nhân viên');
    expect(x.table).toEqual(table);
  });
  it('csv (BOM, quotes) → read back the same, also with ;', () => {
    expect(readCsvText(writeCsvText(table))).toEqual(table);
    expect(readCsvText(writeCsvText(table, ';'))).toEqual(table);
  });
});

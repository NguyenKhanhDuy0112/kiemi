import { describe, expect, it } from 'vitest';
import { parseAddress, readCsvText, toFileTable } from './read';

describe('file readers [Q-04]', () => {
  it('reads CSV with ; or tab, quotes, BOM and CRLF', () => {
    expect(readCsvText('﻿Mã;Tên\r\nA1;"Áo; ""dài"""\r\nB2;Quần').rows).toEqual([
      { Mã: 'A1', Tên: 'Áo; "dài"' },
      { Mã: 'B2', Tên: 'Quần' },
    ]);
    expect(readCsvText('a\tb\n1\t2').rows).toEqual([{ a: '1', b: '2' }]);
    expect(readCsvText('').rows).toEqual([]);
  });
  it('names blank and duplicate headers, drops empty rows', () => {
    expect(
      toFileTable([
        ['x', '', 'x'],
        ['1', '2', '3'],
        ['', '', ''],
      ]),
    ).toEqual({
      columns: ['x', 'Cột 2', 'x (2)'],
      rows: [{ x: '1', 'Cột 2': '2', 'x (2)': '3' }],
    });
  });
  it('parses cell addresses', () => {
    expect(parseAddress('B3')).toEqual({ col: 2, row: 3 });
    expect(parseAddress('aa10')).toEqual({ col: 27, row: 10 });
    expect(() => parseAddress('3B')).toThrow(/Invalid cell/);
  });
});

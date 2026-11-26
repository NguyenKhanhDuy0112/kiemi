import ExcelJS from 'exceljs';
import type { FileTable } from './read';

/** Table → .xlsx bytes, header in bold [P-09]. */
export async function writeXlsx(table: FileTable, sheet = 'Dữ liệu'): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet.slice(0, 31) || 'Dữ liệu');
  ws.addRow(table.columns);
  ws.getRow(1).font = { bold: true };
  for (const r of table.rows) ws.addRow(table.columns.map((c) => r[c] ?? ''));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const quote = (v: string, delimiter: string) =>
  /["\r\n]/.test(v) || v.includes(delimiter) ? `"${v.replace(/"/g, '""')}"` : v;

/** Table → CSV text with a BOM so Excel reads Vietnamese letters right [P-09]. */
export function writeCsvText(table: FileTable, delimiter = ','): string {
  const lines = [table.columns, ...table.rows.map((r) => table.columns.map((c) => r[c] ?? ''))];
  return `﻿${lines.map((l) => l.map((v) => quote(v, delimiter)).join(delimiter)).join('\r\n')}\r\n`;
}

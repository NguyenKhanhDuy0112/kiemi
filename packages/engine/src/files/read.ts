import ExcelJS from 'exceljs';
import { extractText, getDocumentProxy } from 'unpdf';
import { EngineError } from '../errors';

/** A table read from a file: header row → column names, other rows → objects of text [Q-04]. */
export interface FileTable {
  columns: string[];
  rows: Record<string, string>[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Excel cell → the text a tester sees (dates as dd/MM/yyyy). */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const hasTime = v.getUTCHours() + v.getUTCMinutes() + v.getUTCSeconds() > 0;
    const d = `${pad(v.getUTCDate())}/${pad(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
    return hasTime ? `${d} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}` : d;
  }
  if (typeof v === 'object') {
    if ('result' in v) return v.result === undefined || v.result === null ? '' : String(v.result);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return String(v.error);
  }
  return String(v);
}

/** Header + body rows → objects; blank headers become "Cột N", duplicates get a suffix. */
export function toFileTable(raw: string[][]): FileTable {
  const [header, ...body] = raw;
  if (!header || header.every((h) => h.trim() === '')) return { columns: [], rows: [] };
  const seen = new Map<string, number>();
  const columns = header.map((h, i) => {
    const base = h.trim() || `Cột ${i + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
  const rows = body
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])));
  return { columns, rows };
}

async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch (err) {
    throw new EngineError(
      'ACTION_FAILED',
      'The downloaded file is not a valid Excel (.xlsx) file',
      {
        message: err instanceof Error ? err.message : String(err),
      },
    );
  }
  return wb;
}

/** `B3` → { col: 2, row: 3 }; `AA10` works too. */
export function parseAddress(address: string): { col: number; row: number } {
  const m = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(address.trim());
  if (!m)
    throw new EngineError('INVALID_PARAMS', `Invalid cell "${address}" (use e.g. B3)`, {
      cell: address,
    });
  let col = 0;
  for (const ch of (m[1] as string).toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(m[2]) };
}

export interface ExcelRead {
  sheets: string[];
  sheet: string;
  table: FileTable;
  /** Text of `cell`, when asked. */
  cell?: string;
}

/**
 * Reads an .xlsx [Q-04]: one sheet (default: the first), optionally only the
 * `range` (`A3:D10`, first row = header), and/or a single `cell` (`B3`).
 */
export async function readXlsx(
  bytes: Uint8Array,
  o: { sheet?: string | undefined; range?: string | undefined; cell?: string | undefined } = {},
): Promise<ExcelRead> {
  const wb = await loadWorkbook(bytes);
  const sheets = wb.worksheets.map((w) => w.name);
  const ws = o.sheet === undefined ? wb.worksheets[0] : wb.getWorksheet(o.sheet);
  if (!ws)
    throw new EngineError(
      'ACTION_FAILED',
      `Sheet "${o.sheet}" not found (has: ${sheets.join(', ')})`,
      {
        sheet: o.sheet,
        sheets,
      },
    );
  let from = { col: 1, row: 1 };
  let to = { col: ws.columnCount, row: ws.rowCount };
  if (o.range) {
    const [a, b] = o.range.split(':');
    from = parseAddress(a ?? '');
    to = parseAddress(b ?? a ?? '');
  }
  const raw: string[][] = [];
  for (let r = from.row; r <= to.row; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = from.col; c <= to.col; c++) cells.push(cellText(row.getCell(c)));
    raw.push(cells);
  }
  const out: ExcelRead = { sheets, sheet: ws.name, table: toFileTable(raw) };
  if (o.cell) {
    const at = parseAddress(o.cell);
    out.cell = cellText(ws.getRow(at.row).getCell(at.col));
  }
  return out;
}

/** RFC 4180 CSV with `,` `;` or tab detected from the first line [Q-04]. */
export function readCsvText(input: string): FileTable {
  const text = input.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t'].reduce((best, d) =>
    first.split(d).length > first.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return toFileTable(rows);
}

/** All text of a PDF, pages joined by a new line [Q-04]. */
export async function readPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join('\n').trim();
  } catch (err) {
    throw new EngineError('ACTION_FAILED', 'The downloaded file is not a readable PDF', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

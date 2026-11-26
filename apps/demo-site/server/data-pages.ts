import ExcelJS from 'exceljs';

/**
 * Data for the "data & calculation" demo pages (M12): a 500-row staff list
 * (search / filter / sort / paging), a payroll with Excel + PDF export and an
 * Excel import that reports the rows it rejects.
 */

// ---------- staff list (500 rows) ----------
export interface Person {
  code: string;
  name: string;
  dept: string;
  salary: number;
  joined: string; // dd/MM/yyyy
}

export const DEPARTMENTS = ['Kế toán', 'Kỹ thuật', 'Nhân sự', 'Kinh doanh', 'Vận hành'] as const;
const FIRST = [
  'An',
  'Ánh',
  'Bình',
  'Châu',
  'Dũng',
  'Đức',
  'Giang',
  'Hà',
  'Hải',
  'Khánh',
  'Linh',
  'Minh',
  'Ngân',
  'Phúc',
  'Quân',
  'Sơn',
  'Thảo',
  'Trang',
  'Uyên',
  'Việt',
];
const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Đặng', 'Vũ', 'Bùi', 'Đỗ', 'Ngô'];

const pad = (n: number) => String(n).padStart(2, '0');

export function seedPeople(count = 500): Person[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      code: `NV${String(n).padStart(4, '0')}`,
      name: `${LAST[n % LAST.length]} ${FIRST[(n * 7) % FIRST.length]} ${FIRST[(n * 3) % FIRST.length]}`,
      dept: DEPARTMENTS[n % DEPARTMENTS.length] as string,
      salary: 8_000_000 + ((n * 137) % 40) * 500_000,
      joined: `${pad(1 + (n % 28))}/${pad(1 + (n % 12))}/${2015 + (n % 11)}`,
    };
  });
}

export type SortKey = 'code' | 'name' | 'dept' | 'salary' | 'joined';
export interface PeopleQuery {
  q?: string;
  dept?: string;
  sort?: SortKey;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  /** Deliberate bug: two neighbouring rows swapped after sorting (`?bug=sort`). */
  bugSort?: boolean;
  /** Deliberate bug: the department filter lets one other row through (`?bug=filter`). */
  bugFilter?: boolean;
}

const collator = new Intl.Collator('vi');
const dateKey = (d: string) => d.split('/').reverse().join('');

export function queryPeople(all: Person[], o: PeopleQuery) {
  const q = (o.q ?? '').trim().toLocaleLowerCase('vi');
  let rows = all.filter(
    (p) =>
      (!q || p.name.toLocaleLowerCase('vi').includes(q) || p.code.toLowerCase().includes(q)) &&
      (!o.dept || p.dept === o.dept),
  );
  if (o.bugFilter && o.dept) {
    const stray = all.find(
      (p) => p.dept !== o.dept && (!q || p.name.toLocaleLowerCase('vi').includes(q)),
    );
    if (stray) rows = [...rows, stray];
  }
  const key = o.sort ?? 'code';
  const sign = o.dir === 'desc' ? -1 : 1;
  rows = [...rows].sort((a, b) => {
    const c =
      key === 'salary'
        ? a.salary - b.salary
        : key === 'joined'
          ? dateKey(a.joined).localeCompare(dateKey(b.joined))
          : collator.compare(a[key], b[key]);
    return sign * (c || a.code.localeCompare(b.code));
  });
  if (o.bugSort && rows.length > 12)
    [rows[10], rows[11]] = [rows[11] as Person, rows[10] as Person];
  const pageSize = Math.min(100, Math.max(1, Math.floor(o.pageSize ?? 20)));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(o.page ?? 1)), totalPages);
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: rows.length,
    totalPages,
  };
}

// ---------- payroll ----------
export interface PayrollRow {
  name: string;
  dept: string;
  base: number;
  allowance: number;
  bonus: number;
  /** base + allowance + bonus − 10,5% insurance of base. */
  net: number;
}

export const INSURANCE_RATE = 0.105;

export function netPay(base: number, allowance: number, bonus: number): number {
  return Math.round(base + allowance + bonus - base * INSURANCE_RATE);
}

export function payroll(): PayrollRow[] {
  const raw: [string, string, number, number, number][] = [
    ['Nguyễn Văn An', 'Kế toán', 12_000_000, 1_000_000, 500_000],
    ['Trần Thị Bình', 'Kỹ thuật', 18_500_000, 1_500_000, 2_000_000],
    ['Lê Minh Quân', 'Kinh doanh', 15_000_000, 2_000_000, 3_500_000],
    ['Phạm Thu Hà', 'Nhân sự', 11_000_000, 800_000, 0],
    ['Đặng Quốc Việt', 'Vận hành', 9_500_000, 600_000, 250_000],
  ];
  return raw.map(([name, dept, base, allowance, bonus]) => ({
    name,
    dept,
    base,
    allowance,
    bonus,
    net: netPay(base, allowance, bonus),
  }));
}

export const sumOf = (rows: PayrollRow[], key: 'base' | 'allowance' | 'bonus' | 'net') =>
  rows.reduce((s, r) => s + r[key], 0);

const HEADER = ['Họ tên', 'Phòng ban', 'Lương cơ bản', 'Phụ cấp', 'Thưởng', 'Thực lĩnh'];

export async function payrollXlsx(rows: PayrollRow[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bảng lương');
  ws.addRow(['BẢNG LƯƠNG THÁNG 11/2026']);
  ws.addRow(HEADER);
  ws.getRow(2).font = { bold: true };
  for (const r of rows) ws.addRow([r.name, r.dept, r.base, r.allowance, r.bonus, r.net]);
  ws.addRow([
    'Tổng',
    '',
    sumOf(rows, 'base'),
    sumOf(rows, 'allowance'),
    sumOf(rows, 'bonus'),
    sumOf(rows, 'net'),
  ]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** A one-page PDF with plain Latin text (no accents: standard fonts only). */
export function payrollPdf(rows: PayrollRow[]): Uint8Array {
  const plain = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const lines = [
    'BANG LUONG THANG 11/2026',
    ...rows.map((r) => `${plain(r.name)} - ${r.net}`),
    `Tong thuc linh: ${sumOf(rows, 'net')}`,
  ];
  const content = lines
    .map((l, i) => `BT /F1 12 Tf 40 ${780 - i * 20} Td (${l.replace(/[()\\]/g, '')}) Tj ET`)
    .join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

// ---------- import with rejected rows ----------
export interface ImportRow {
  code: string;
  name: string;
  email: string;
  salary: number;
}
export interface ImportError {
  /** Row number in the file (the header is row 1). */
  row: number;
  message: string;
}
export interface ImportResult {
  total: number;
  imported: ImportRow[];
  errors: ImportError[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates cell rows (header first) the way the demo import page does. */
export function validateImport(table: string[][], existing: readonly string[] = []): ImportResult {
  const [header = [], ...body] = table;
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const col = {
    code: idx(['mã', 'ma', 'code']),
    name: idx(['họ tên', 'ho ten', 'name']),
    email: idx(['email']),
    salary: idx(['lương', 'luong', 'salary']),
  };
  const result: ImportResult = { total: 0, imported: [], errors: [] };
  const seen = new Set(existing.map((c) => c.toLowerCase()));
  if (Object.values(col).some((c) => c < 0)) {
    result.errors.push({ row: 1, message: 'Thiếu cột: cần Mã, Họ tên, Email, Lương' });
    return result;
  }
  body.forEach((cells, i) => {
    if (cells.every((c) => c.trim() === '')) return;
    result.total++;
    const row = i + 2;
    const get = (c: number) => (cells[c] ?? '').trim();
    const [code, name, email, salaryText] = [
      get(col.code),
      get(col.name),
      get(col.email),
      get(col.salary),
    ];
    const salary = Number(salaryText.replace(/[.\s]/g, '').replace(',', '.'));
    const problems: string[] = [];
    if (!code) problems.push('Mã không được trống');
    else if (seen.has(code.toLowerCase())) problems.push(`Mã ${code} bị trùng`);
    if (!name) problems.push('Họ tên không được trống');
    if (!EMAIL.test(email)) problems.push('Email không hợp lệ');
    if (!salaryText || !Number.isFinite(salary) || salary <= 0)
      problems.push('Lương phải là số lớn hơn 0');
    if (problems.length) {
      result.errors.push({ row, message: problems.join('; ') });
      return;
    }
    seen.add(code.toLowerCase());
    result.imported.push({ code, name, email, salary });
  });
  return result;
}

function csvRows(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const d = [',', ';', '\t'].reduce((b, x) =>
    first.split(x).length > first.split(b).length ? x : b,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i] as string;
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === d) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
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
  return rows;
}

/** Reads an uploaded .xlsx or .csv into cell rows. */
export async function readUpload(bytes: Uint8Array, fileName: string): Promise<string[][]> {
  if (/\.xlsx$/i.test(fileName)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const out: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const v = row.getCell(c).value;
        cells.push(
          v === null || v === undefined
            ? ''
            : typeof v === 'object' && 'text' in v
              ? String(v.text)
              : String(v),
        );
      }
      out.push(cells);
    });
    return out;
  }
  return csvRows(new TextDecoder().decode(bytes));
}

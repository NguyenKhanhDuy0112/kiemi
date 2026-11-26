import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2E, startE2E, step, summary } from './helpers';

let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

const b64 = (data: Uint8Array | string) => Buffer.from(data).toString('base64');
const page = (name: string, mime: string, data: Uint8Array | string) =>
  step('goto', {
    url: `data:text/html;charset=utf-8,${encodeURIComponent(
      `<a id="d" download="${name}" href="data:${mime};base64,${b64(data)}">Tải về</a>`,
    )}`,
  });
const click = { target: { css: '#d' } };
const quick = { request: { options: { defaultStepTimeoutMs: 3000 } } };

async function payroll(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bảng lương');
  ws.addRow(['Tên', 'Phòng', 'Lương']);
  ws.addRow(['An', 'Kế toán', '10.000.000']);
  ws.addRow(['Bình', 'Kế toán', '12.000.000']);
  wb.addWorksheet('Ghi chú').addRow(['Tháng 11/2026']);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** A one-page PDF with plain (uncompressed) text. */
function pdf(text: string): string {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${`BT /F1 18 Tf 20 100 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 18 Tf 20 100 Td (${text}) Tj ET\nendstream`,
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
  return out;
}

describe('downloads [Q-04]', () => {
  it('reads an Excel file into a list, a cell and a region; the sum matches', async () => {
    const r = await e.run([
      page('bang-luong.xlsx', 'application/octet-stream', await payroll()),
      step('download', {
        ...click,
        into: 'f',
        expectName: 'luong',
        expectType: 'xlsx',
        minBytes: 100,
        cell: 'C2',
      }),
      step('assertNumber', { actual: "{{SUM(f.rows, 'Lương')}}", op: 'eq', value: 22000000 }),
      step('assertNumber', { actual: '{{f.rows.length}}', op: 'eq', value: 2 }),
      step('assertNumber', { actual: '{{f.cell}}', op: 'eq', value: '10.000.000' }),
      step('assertNumber', { actual: '{{f.sheets.length}}', op: 'eq', value: 2 }),
      page('bang-luong.xlsx', 'application/octet-stream', await payroll()),
      step('download', { ...click, into: 'g', sheet: 'Bảng lương', range: 'A2:C3' }),
      step('assertNumber', { actual: '{{g.rows.length}}', op: 'eq', value: 1 }), // header = row 2
    ]);
    expect(summary(r).filter((x) => !x.endsWith('passed'))).toEqual([]);
  });

  it('reads CSV (; delimiter, quotes) and PDF text', async () => {
    const r = await e.run([
      page('ds.csv', 'text/csv', 'Mã;Tên\nA1;"Áo, dài"\nB2;Quần\n'),
      step('download', { ...click, into: 'c' }),
      step('assertNumber', { actual: '{{c.rows.length}}', op: 'eq', value: 2 }),
      page('hoa-don.pdf', 'application/pdf', pdf('Tong cong 1250000')),
      step('download', { ...click, into: 'p', expectType: 'pdf' }),
      step('assertExpected', { actual: '{{p.text}}', data: 'Tong cong 1250000' }),
    ]);
    expect(summary(r).filter((x) => !x.endsWith('passed'))).toEqual([]);
  });

  it('fails clearly on a wrong name, type or size', async () => {
    const r = await e.run(
      [
        page('a.csv', 'text/csv', 'x\n1\n'),
        step('download', { ...click, into: 'f', expectName: 'luong' }, { mode: 'soft' }),
        step('download', { ...click, into: 'f', expectType: 'xlsx' }, { mode: 'soft' }),
        step('download', { ...click, into: 'f', maxBytes: 1 }, { mode: 'soft' }),
      ],
      quick,
    );
    expect(summary(r)).toEqual([
      '1 passed',
      '2 failed ASSERTION_FAILED',
      '3 failed ASSERTION_FAILED',
      '4 failed ASSERTION_FAILED',
    ]);
  });
});

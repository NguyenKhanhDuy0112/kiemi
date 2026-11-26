import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { writeWorkbook } from './excel';

describe('report workbook [X-01]', () => {
  it('writes a summary and a detail sheet that Excel can open', async () => {
    const bytes = await writeWorkbook([
      {
        name: 'Tổng hợp',
        intro: [['Báo cáo Release 3.2'], ['Môi trường', 'UAT']],
        columns: ['Test', 'Kết quả'],
        rows: [
          ['Đăng nhập', 'Đạt'],
          ['Tạo đơn', 'Lỗi'],
        ],
      },
      { name: 'Chi tiết/1?', columns: ['Bước', 'Kỳ vọng', 'Thực tế'], rows: [['1', 'a', 'b']] },
      { name: 'Chi tiết/1?', columns: ['x'], rows: [] },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Tổng hợp', 'Chi tiết 1', 'Chi tiết 1 2']);
    const ws = wb.getWorksheet('Tổng hợp');
    expect(ws?.getCell('A1').value).toBe('Báo cáo Release 3.2');
    expect(ws?.getCell('B2').value).toBe('UAT');
    // intro (2 lines) + blank + header at row 4
    expect(ws?.getRow(4).values).toEqual([undefined, 'Test', 'Kết quả']);
    expect(ws?.getRow(6).getCell(2).value).toBe('Lỗi');
    expect(ws?.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
  });
});

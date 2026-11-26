import type { Services } from '@kiemi/db';
import {
  CURRENT_SCHEMA_VERSION,
  type StepInput as FullStepInput,
  TestCaseSchema,
} from '@kiemi/schema';
import { v7 as uuidv7 } from 'uuid';

type StepInput = Omit<FullStepInput, 'id'>;

/** Folder and suite of the "data & calculation" samples (L-03 #1, #2, #4, #5). */
export const DATA_SAMPLE_FOLDER = 'Dữ liệu & tính toán';
export const DATA_SAMPLE_SUITE = 'Mẫu dữ liệu & tính toán';

function doc(
  name: string,
  description: string,
  tags: string[],
  steps: StepInput[],
  cleanup: StepInput[] = [],
) {
  return TestCaseSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: uuidv7(),
    name,
    description,
    tags: ['mẫu', ...tags],
    steps: steps.map((s, i) => ({ ...s, id: `s${i + 1}` })),
    cleanup: cleanup.map((s, i) => ({ ...s, id: `c${i + 1}` })),
  });
}

const reset: StepInput = { action: 'api', params: { method: 'POST', url: '/api/reset' } };
const testId = (id: string) => ({ css: `[data-testid="${id}"]` });
const addToCart = (name: string, times = 1): StepInput[] =>
  Array.from({ length: times }, () => ({
    action: 'click',
    params: { target: { role: 'button', name: `Thêm ${name}` } },
  }));
const walk = { allPages: true, next: { css: '#next' } };
const firstRow = (table: string): StepInput => ({
  action: 'waitUntil',
  params: {
    condition: { assert: 'visible', target: { css: `${table} tbody tr:first-child` } },
    timeoutSec: 10,
  },
});

/** Named formulas the samples use; shown on the "Công thức" screen. */
export const SAMPLE_FORMULAS = {
  TongTien: {
    params: ['tamTinh', 'giam'],
    expression: 'ROUND((tamTinh - giam) * 1.08) + IF(tamTinh - giam >= 500000, 0, 30000)',
    description:
      'Tổng tiền giỏ hàng: trừ giảm giá, cộng VAT 8%, cộng ship 30.000 ₫ nếu dưới 500.000 ₫.',
  },
};

/** Installs the 4 data samples of L-03 into the sample project [M12-09]. */
export function installDataSamples(services: Services, projectId: string, environmentId: string) {
  services.projects.setFormulas(projectId, SAMPLE_FORMULAS);
  const folder = services.folders.create({ projectId, name: DATA_SAMPLE_FOLDER });
  const docs = [
    doc(
      'Mẫu 1. Giỏ hàng & khuyến mãi',
      'Thêm hàng, áp mã GIAM10 rồi kiểm tra từng dòng tiền bằng công thức "TongTien" (giảm → VAT → ship).',
      ['tính toán'],
      [
        { action: 'goto', params: { url: '/shop.html' } },
        ...addToCart('Áo thun', 2),
        ...addToCart('Mũ lưỡi trai'),
        { action: 'fill', params: { target: { label: 'Mã giảm giá' }, value: 'GIAM10' } },
        { action: 'click', params: { target: { role: 'button', name: 'Áp dụng' } } },
        {
          action: 'assertNumber',
          params: { target: testId('subtotal'), op: 'eq', value: '{{150000 * 2 + 80000}}' },
        },
        {
          action: 'assertNumber',
          params: { target: testId('discount'), op: 'eq', value: '{{ROUND(380000 * 10 / 100)}}' },
        },
        {
          action: 'assertNumber',
          params: { target: testId('vat'), op: 'eq', value: '{{ROUND((380000 - 38000) * 0.08)}}' },
        },
        { action: 'assertNumber', params: { target: testId('shipping'), op: 'eq', value: 30000 } },
        {
          action: 'assertExpected',
          params: { target: testId('total'), formula: '{{TongTien(380000, 38000)}}' },
        },
      ],
    ),
    doc(
      'Mẫu 2. Bảng lương và xuất Excel',
      'Xuất bảng lương ra Excel, đọc file về và so tổng cột "Thực lĩnh" với tổng trên màn hình.',
      ['tính toán', 'file'],
      [
        { action: 'goto', params: { url: '/payroll.html' } },
        {
          action: 'waitUntil',
          params: {
            condition: { assert: 'visible', target: testId('payroll-total') },
            timeoutSec: 10,
          },
        },
        {
          action: 'download',
          params: {
            target: { css: '#export-xlsx' },
            into: 'bangLuong',
            expectName: 'bang-luong',
            expectType: 'xlsx',
            range: 'A2:F7',
            cell: 'F8',
          },
        },
        {
          action: 'assertNumber',
          params: {
            actual: "{{SUM(bangLuong.rows, 'Thực lĩnh')}}",
            op: 'eq',
            value: '{{bangLuong.cell}}',
          },
        },
        {
          action: 'assertNumber',
          params: {
            target: { css: '[data-testid="payroll-total"] th:last-child' },
            op: 'eq',
            value: '{{bangLuong.cell}}',
          },
        },
        {
          action: 'download',
          params: { target: { css: '#export-pdf' }, into: 'phieuLuong', expectType: 'pdf' },
        },
        {
          action: 'assertNumber',
          params: { actual: '{{len(phieuLuong.text)}}', op: 'gt', value: 50 },
        },
      ],
    ),
    doc(
      'Mẫu 3. Tìm kiếm, lọc, sắp xếp, phân trang',
      'Danh sách 500 nhân viên: đếm đủ 500 dòng qua mọi trang, lọc theo phòng ban, kiểm tra thứ tự tên tiếng Việt.',
      ['bảng'],
      [
        { action: 'goto', params: { url: '/list.html' } },
        firstRow('#people-table'),
        {
          action: 'assertRowTotal',
          params: { target: { css: '#people-table' }, label: { css: '#total-label' }, ...walk },
        },
        { action: 'select', params: { target: { label: 'Phòng ban' }, option: 'Kế toán' } },
        {
          action: 'waitUntil',
          params: {
            condition: {
              assert: 'text',
              target: { css: '#total-label' },
              op: 'contains',
              value: 'Tổng 100',
            },
            timeoutSec: 10,
          },
        },
        {
          action: 'assertAllRows',
          params: {
            target: { css: '#people-table' },
            column: 'Phòng ban',
            op: 'equals',
            value: 'Kế toán',
            ...walk,
          },
        },
        { action: 'goto', params: { url: '/list.html' } },
        firstRow('#people-table'),
        { action: 'click', params: { target: { role: 'button', name: 'Họ tên' } } },
        { action: 'wait', params: { seconds: 1 } },
        {
          action: 'assertSorted',
          params: {
            target: { css: '#people-table' },
            column: 'Họ tên',
            direction: 'asc',
            kind: 'text',
            ...walk,
          },
        },
      ],
    ),
    doc(
      'Mẫu 4. Nhập Excel và dòng lỗi',
      'Tự tạo file 5 dòng (dòng thứ 3 có email sai), tải lên rồi kiểm tra hệ thống báo đúng dòng lỗi.',
      ['file', 'import'],
      [
        reset,
        { action: 'goto', params: { url: '/import.html' } },
        {
          action: 'generateFile',
          params: {
            into: 'file',
            fileName: 'nhan-vien',
            format: 'xlsx',
            count: 5,
            columns: {
              Mã: 'NV{{loop.index}}',
              'Họ tên': 'Nhân viên {{loop.index}}',
              Email: "{{IF(loop.index = 3, 'email-sai', loop.index & '@example.com')}}",
              Lương: '{{10000000 + loop.index * 500000}}',
            },
          },
        },
        {
          action: 'upload',
          params: { target: { label: 'Chọn file (.xlsx hoặc .csv)' }, files: '{{file.path}}' },
        },
        { action: 'click', params: { target: { role: 'button', name: 'Nhập' } } },
        {
          action: 'assertText',
          params: {
            target: { css: '#result' },
            op: 'contains',
            value: 'Đã nhập 4/5 dòng, 1 dòng lỗi',
          },
        },
        {
          action: 'assertText',
          params: {
            target: { css: '#errors' },
            op: 'contains',
            value: 'Dòng 4: Email không hợp lệ',
          },
        },
        {
          action: 'assertText',
          params: {
            target: testId('imported-count'),
            op: 'contains',
            value: 'Đã nhập 4 nhân viên',
          },
        },
      ],
      [reset],
    ),
  ];
  const rows = docs.map((d) => services.testCases.insertDocument(projectId, folder.id, d));
  const suite = services.suites.create({ projectId, name: DATA_SAMPLE_SUITE, environmentId });
  services.suites.setItems(
    suite.id,
    rows.map((r) => ({ testCaseId: r.id })),
  );
  return rows;
}

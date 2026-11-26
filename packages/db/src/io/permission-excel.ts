import {
  cellKey,
  type PermAccess,
  type PermissionMatrix,
  PermissionMatrixSchema,
} from '@kiemi/schema';
import type { Table } from './table';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const slug = (s: string) => norm(s).replace(/ /g, '-');

const NAME_COLS = ['chuc nang', 'function', 'ten chuc nang', 'man hinh', 'menu', 'tinh nang'];
const PATH_COLS = ['duong dan', 'url', 'path', 'dia chi', 'link'];

const SEE = ['thay', 'see', 'yes', 'co', 'x', 'v', 'ok', '1', 'cho phep', 'duoc'];
const HIDDEN = ['khong thay', 'an', 'hidden', 'no', 'khong', '-', '0', 'khong hien'];
const BLOCKED = ['bi chan', 'chan', 'blocked', 'deny', 'cam', '403', 'khong duoc phep'];

function accessOf(text: string): PermAccess | undefined {
  const t = text.trim() === '✓' ? 'thay' : norm(text);
  if (BLOCKED.includes(t)) return 'blocked';
  if (HIDDEN.includes(t)) return 'hidden';
  if (SEE.includes(t)) return 'see';
  return undefined;
}

/** Sample file: the 3-role × 10-function matrix of the demo site. */
export const PERMISSION_TEMPLATE: Table = {
  columns: ['Chức năng', 'Đường dẫn', 'Nhân viên', 'Quản lý', 'Kế toán'],
  rows: [
    ['Đơn nghỉ phép', 'don-nghi', 'Thấy', 'Thấy', 'Không thấy'],
    ['Duyệt đơn', 'duyet-don', 'Bị chặn', 'Thấy', 'Bị chặn'],
    ['Bảng lương', 'bang-luong', 'Bị chặn', 'Thấy', 'Thấy'],
    ['Hồ sơ nhân sự', 'nhan-su', 'Bị chặn', 'Thấy', 'Không thấy'],
    ['Báo cáo', 'bao-cao', 'Không thấy', 'Thấy', 'Thấy'],
    ['Tài khoản', 'tai-khoan', 'Bị chặn', 'Thấy', 'Bị chặn'],
    ['Kho hàng', 'kho', 'Thấy', 'Không thấy', 'Bị chặn'],
    ['Mua hàng', 'mua-hang', 'Bị chặn', 'Thấy', 'Thấy'],
    ['Hóa đơn', 'hoa-don', 'Bị chặn', 'Không thấy', 'Thấy'],
    ['Cài đặt hệ thống', 'cai-dat', 'Bị chặn', 'Thấy', 'Bị chặn'],
  ].map(([a, b, c, d, e]) => ({
    'Chức năng': a as string,
    'Đường dẫn': `/portal-fn.html?f=${b}`,
    'Nhân viên': c as string,
    'Quản lý': d as string,
    'Kế toán': e as string,
  })),
};

export interface PermissionImport {
  matrix: PermissionMatrix;
  warnings: string[];
}

/**
 * Reads "function × role" cells (Thấy / Không thấy / Bị chặn) into a matrix [Q-09].
 * Columns: function name, optional address, then one column per role.
 */
export function matrixFromTable(table: Table, name: string, id: string): PermissionImport {
  const warnings: string[] = [];
  const nameCol = table.columns.find((c) => NAME_COLS.includes(norm(c))) ?? table.columns[0];
  const pathCol = table.columns.find((c) => PATH_COLS.includes(norm(c)));
  const roleCols = table.columns.filter((c) => c !== nameCol && c !== pathCol);
  const matrix = PermissionMatrixSchema.parse({
    id,
    name,
    roles: roleCols.map((c) => ({ key: slug(c) || c, name: c.trim() })),
    functions: [],
    cells: {},
  });
  if (!nameCol) return { matrix, warnings: ['File không có cột "Chức năng".'] };
  if (roleCols.length === 0) warnings.push('Chưa thấy cột vai trò nào (mỗi vai trò một cột).');

  const taken = new Set<string>();
  table.rows.forEach((row, i) => {
    const fname = (row[nameCol] ?? '').trim();
    if (!fname) return;
    const line = i + 2;
    let key = slug(fname) || `f-${line}`;
    for (let n = 2; taken.has(key); n++) key = `${slug(fname)}-${n}`;
    taken.add(key);
    let path = pathCol ? (row[pathCol] ?? '').trim() : '';
    if (!path) {
      path = `/${key}.html`;
      warnings.push(`Dòng ${line}: chưa có đường dẫn cho "${fname}", tạm dùng ${path}.`);
    }
    matrix.functions.push({ key, name: fname, path });
    for (const rc of roleCols) {
      const raw = (row[rc] ?? '').trim();
      const role = matrix.roles.find((r) => r.name === rc.trim());
      if (!role) continue;
      const a = accessOf(raw);
      if (!a) {
        warnings.push(`Dòng ${line}: không hiểu "${raw}" ở cột ${rc}, coi là "Không thấy".`);
      }
      matrix.cells[cellKey(role.key, key)] = a ?? 'hidden';
    }
  });
  return { matrix: PermissionMatrixSchema.parse(matrix), warnings };
}

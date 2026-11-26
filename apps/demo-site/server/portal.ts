import type { Role } from './store';

/** What a role gets for a function: menu + page, page only, or neither (403) [Q-09]. */
export type Access = 'see' | 'hidden' | 'blocked';

export const PORTAL_FUNCTIONS = [
  { key: 'don-nghi', name: 'Đơn nghỉ phép' },
  { key: 'duyet-don', name: 'Duyệt đơn' },
  { key: 'bang-luong', name: 'Bảng lương' },
  { key: 'nhan-su', name: 'Hồ sơ nhân sự' },
  { key: 'bao-cao', name: 'Báo cáo' },
  { key: 'tai-khoan', name: 'Tài khoản' },
  { key: 'kho', name: 'Kho hàng' },
  { key: 'mua-hang', name: 'Mua hàng' },
  { key: 'hoa-don', name: 'Hóa đơn' },
  { key: 'cai-dat', name: 'Cài đặt hệ thống' },
] as const;

/** Same table as the sample Excel file (`PERMISSION_TEMPLATE`). */
export const PORTAL_ACCESS: Record<Role, Record<string, Access>> = {
  nhanvien: {
    'don-nghi': 'see',
    'duyet-don': 'blocked',
    'bang-luong': 'blocked',
    'nhan-su': 'blocked',
    'bao-cao': 'hidden',
    'tai-khoan': 'blocked',
    kho: 'see',
    'mua-hang': 'blocked',
    'hoa-don': 'blocked',
    'cai-dat': 'blocked',
  },
  quanly: {
    'don-nghi': 'see',
    'duyet-don': 'see',
    'bang-luong': 'see',
    'nhan-su': 'see',
    'bao-cao': 'see',
    'tai-khoan': 'see',
    kho: 'hidden',
    'mua-hang': 'see',
    'hoa-don': 'hidden',
    'cai-dat': 'see',
  },
  ketoan: {
    'don-nghi': 'hidden',
    'duyet-don': 'blocked',
    'bang-luong': 'see',
    'nhan-su': 'hidden',
    'bao-cao': 'see',
    'tai-khoan': 'blocked',
    kho: 'blocked',
    'mua-hang': 'see',
    'hoa-don': 'see',
    'cai-dat': 'blocked',
  },
};

/**
 * Access of a role to a function. `leaks` ("role|function") are deliberate server bugs the
 * tests must catch: the page opens although the role should be blocked.
 */
export function portalAccess(
  role: Role,
  key: string,
  leaks: ReadonlySet<string> = new Set(),
): Access | null {
  const a = PORTAL_ACCESS[role][key];
  if (!a) return null;
  return a === 'blocked' && leaks.has(`${role}|${key}`) ? 'hidden' : a;
}

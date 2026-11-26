import { accessOf, permissionSteps } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { readExcel, writeExcel } from './excel';
import { matrixFromTable, PERMISSION_TEMPLATE } from './permission-excel';

describe('permission matrix from Excel [Q-09]', () => {
  it('reads the 3 × 10 sample file', async () => {
    const t = await readExcel(await writeExcel(PERMISSION_TEMPLATE, 'Phân quyền'));
    const { matrix, warnings } = matrixFromTable(t, 'Phân quyền cổng', 'm1');
    expect(warnings).toEqual([]);
    expect(matrix.roles.map((r) => r.key)).toEqual(['nhan-vien', 'quan-ly', 'ke-toan']);
    expect(matrix.functions).toHaveLength(10);
    expect(accessOf(matrix, 'nhan-vien', 'duyet-don')).toBe('blocked');
    expect(accessOf(matrix, 'ke-toan', 'bao-cao')).toBe('see');
    expect(accessOf(matrix, 'nhan-vien', 'bao-cao')).toBe('hidden');
  });
  it('accepts ticks and warns about unknown cells and missing paths', () => {
    const { matrix, warnings } = matrixFromTable(
      {
        columns: ['Chức năng', 'Admin', 'Khách'],
        rows: [{ 'Chức năng': 'Báo cáo', Admin: '✓', Khách: '???' }],
      },
      'x',
      'm',
    );
    expect(accessOf(matrix, 'admin', 'bao-cao')).toBe('see');
    expect(accessOf(matrix, 'khach', 'bao-cao')).toBe('hidden');
    expect(warnings.join('|')).toMatch(/đường dẫn/);
    expect(warnings.join('|')).toMatch(/"\?\?\?"/);
  });
  it('makes one test per role with a named soft check for every cell', async () => {
    const t = await readExcel(await writeExcel(PERMISSION_TEMPLATE));
    const { matrix } = matrixFromTable(t, 'P', 'm1');
    const role = {
      ...(matrix.roles[0] as (typeof matrix.roles)[number]),
      username: 'nv',
      password: '1',
    };
    const steps = permissionSteps(matrix, role);
    const checks = steps.filter((s) => s.id.startsWith('perm:'));
    // 10 menu checks + URL checks for every cell that is not "hidden"
    expect(checks.filter((s) => s.id.endsWith(':menu'))).toHaveLength(10);
    expect(checks.filter((s) => s.id.endsWith(':url'))).toHaveLength(9);
    expect(checks.every((s) => s.mode === 'soft')).toBe(true);
    expect(steps.find((s) => s.id === 'perm:nhan-vien|duyet-don:url')?.name).toBe(
      'Nhân viên × Duyệt đơn: bị chặn khi mở thẳng',
    );
  });
});

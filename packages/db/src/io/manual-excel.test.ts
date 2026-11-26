import { ManualCaseSchema, mergeImported } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { readExcel, writeExcel } from './excel';
import { casesFromTable, detectMapping, MANUAL_TEMPLATE, splitNumbered } from './manual-excel';

describe('manual case import from Excel [X-08]', () => {
  it('detects columns by header (accents, English names)', () => {
    expect(detectMapping(['Mã', 'Tên case', 'Ưu tiên', 'Steps', 'Expected Result'])).toEqual({
      id: 'Mã',
      name: 'Tên case',
      priority: 'Ưu tiên',
      action: 'Steps',
      expected: 'Expected Result',
    });
  });
  it('reads the sample file: one row per step, and numbered lists in one cell', async () => {
    const bytes = await writeExcel(MANUAL_TEMPLATE, 'Case');
    const { cases, warnings } = casesFromTable(await readExcel(bytes));
    expect(warnings).toEqual([]);
    expect(cases.map((c) => [c.externalId, c.name, c.priority, c.steps.length])).toEqual([
      ['TC-001', 'Đăng nhập đúng tài khoản', 'high', 2],
      ['TC-002', 'Đăng nhập sai mật khẩu', 'medium', 2],
    ]);
    expect(cases[1]?.steps[1]).toMatchObject({
      action: 'Nhập mật khẩu sai rồi bấm Đăng nhập',
      expected: 'Báo "Sai mật khẩu", vẫn ở trang đăng nhập',
    });
    for (const c of cases) expect(ManualCaseSchema.safeParse(c).success).toBe(true);
  });
  it('imports 100 cases and warns about odd rows', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      Mã: `TC-${i}`,
      'Tên case': `Case ${i}`,
      Bước: 'Làm gì đó',
      'Kết quả': 'Đúng',
    }));
    const r = casesFromTable({ columns: ['Mã', 'Tên case', 'Bước', 'Kết quả'], rows });
    expect(r.cases).toHaveLength(100);
    const odd = casesFromTable({
      columns: ['Tên', 'Bước', 'Ưu tiên'],
      rows: [
        { Tên: '', Bước: 'mồ côi', 'Ưu tiên': '' },
        { Tên: 'A', Bước: '', 'Ưu tiên': 'gấp' },
      ],
    });
    expect(odd.warnings.join('|')).toMatch(/chưa có case nào/);
    expect(odd.warnings.join('|')).toMatch(/ưu tiên "gấp"/);
    expect(odd.warnings.join('|')).toMatch(/không có bước/);
  });
  it('asks for a name column when none is found', () => {
    expect(casesFromTable({ columns: ['x'], rows: [{ x: '1' }] }).warnings[0]).toMatch(/Tên case/);
  });
  it('splits only real numbered lists', () => {
    expect(splitNumbered('1. a\n2) b')).toEqual(['a', 'b']);
    expect(splitNumbered('a\nb')).toBeNull();
    expect(splitNumbered('1. a')).toBeNull();
  });
  it('re-import updates by id and keeps results of unchanged steps', async () => {
    const first = casesFromTable(await readExcel(await writeExcel(MANUAL_TEMPLATE)));
    const marked = first.cases.map((c) => ({
      ...c,
      steps: c.steps.map((s) => ({ ...s, status: 'pass' as const })),
    }));
    const again = casesFromTable({
      ...MANUAL_TEMPLATE,
      rows: MANUAL_TEMPLATE.rows.map((r) =>
        r.Mã === 'TC-001' ? { ...r, 'Tên case': 'Đăng nhập OK' } : r,
      ),
    });
    const m = mergeImported(marked, again.cases);
    expect(m).toMatchObject({ added: 0, updated: 2 });
    expect(m.cases[0]?.name).toBe('Đăng nhập OK');
    expect(m.cases[0]?.steps.every((s) => s.status === 'pass')).toBe(true);
    expect(
      mergeImported(marked, [{ ...marked[0], externalId: 'new', id: 'z' }] as never).added,
    ).toBe(1);
  });
});

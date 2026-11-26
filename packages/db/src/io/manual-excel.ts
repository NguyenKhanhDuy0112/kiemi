import { type ManualCase, ManualCaseSchema } from '@kiemi/schema';
import { newId } from '../repo';
import type { Table } from './table';

/** What a column of the case file means [X-08]. */
export const MANUAL_FIELDS = [
  'id',
  'name',
  'group',
  'priority',
  'preconditions',
  'action',
  'expected',
] as const;
export type ManualField = (typeof MANUAL_FIELDS)[number];
/** Field → column title of the file (missing = not used). */
export type ManualMapping = Partial<Record<ManualField, string>>;

export const MANUAL_COLUMNS = [
  'Mã',
  'Tên case',
  'Nhóm',
  'Ưu tiên',
  'Điều kiện trước',
  'Bước thực hiện',
  'Kết quả mong đợi',
] as const;

/** Sample file: one row per step; the case id/name only on its first row. */
export const MANUAL_TEMPLATE: Table = {
  columns: [...MANUAL_COLUMNS],
  rows: [
    {
      Mã: 'TC-001',
      'Tên case': 'Đăng nhập đúng tài khoản',
      Nhóm: 'Đăng nhập',
      'Ưu tiên': 'Cao',
      'Điều kiện trước': 'Đã có tài khoản hợp lệ',
      'Bước thực hiện': 'Mở trang đăng nhập',
      'Kết quả mong đợi': 'Thấy form đăng nhập',
    },
    {
      'Bước thực hiện': 'Nhập email, mật khẩu đúng rồi bấm Đăng nhập',
      'Kết quả mong đợi': 'Vào trang chủ, thấy tên người dùng',
    },
    {
      Mã: 'TC-002',
      'Tên case': 'Đăng nhập sai mật khẩu',
      Nhóm: 'Đăng nhập',
      'Ưu tiên': 'Trung bình',
      'Bước thực hiện': '1. Mở trang đăng nhập\n2. Nhập mật khẩu sai rồi bấm Đăng nhập',
      'Kết quả mong đợi': '1. Thấy form đăng nhập\n2. Báo "Sai mật khẩu", vẫn ở trang đăng nhập',
    },
  ],
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const HEADERS: Record<ManualField, readonly string[]> = {
  id: ['ma', 'id', 'ma case', 'ma tc', 'tc id', 'test case id', 'stt'],
  name: ['ten case', 'ten', 'test case', 'testcase', 'case', 'tieu de', 'title', 'summary', 'name'],
  group: ['nhom', 'module', 'man hinh', 'chuc nang', 'group', 'feature'],
  priority: ['uu tien', 'priority', 'muc do', 'do uu tien'],
  preconditions: [
    'dieu kien truoc',
    'tien dieu kien',
    'precondition',
    'preconditions',
    'dieu kien',
  ],
  action: ['buoc thuc hien', 'buoc', 'cac buoc', 'steps', 'step', 'thao tac', 'action'],
  expected: ['ket qua mong doi', 'ket qua', 'mong doi', 'expected', 'expected result'],
};

/** Guesses which column is which from the header names; each column is used once. */
export function detectMapping(columns: string[]): ManualMapping {
  const out: ManualMapping = {};
  const used = new Set<string>();
  for (const f of MANUAL_FIELDS) {
    const hit = columns.find((c) => !used.has(c) && HEADERS[f].includes(norm(c)));
    if (hit) {
      out[f] = hit;
      used.add(hit);
    }
  }
  return out;
}

const PRIORITY: Record<string, ManualCase['priority']> = {
  cao: 'high',
  high: 'high',
  'rat cao': 'high',
  critical: 'high',
  p1: 'high',
  '1': 'high',
  thap: 'low',
  low: 'low',
  p3: 'low',
  '3': 'low',
};

/** "1. do x\n2. do y" → ['do x', 'do y']; `null` when the text is not a numbered list. */
export function splitNumbered(text: string): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const re = /^(?:bước\s*)?\d+\s*[.):-]\s*/iu;
  if (!lines.every((l) => re.test(l))) return null;
  return lines.map((l) => l.replace(re, '').trim());
}

export interface ManualImport {
  cases: ManualCase[];
  /** Plain-Vietnamese notes about rows that were skipped or guessed. */
  warnings: string[];
}

/** Reads a test-case table into manual cases: one row per step, a new case at each new id/name. */
export function casesFromTable(
  table: Table,
  mapping: ManualMapping = detectMapping(table.columns),
): ManualImport {
  const warnings: string[] = [];
  const cell = (row: Record<string, string>, f: ManualField): string => {
    const col = mapping[f];
    return col ? (row[col] ?? '').trim() : '';
  };
  if (!mapping.name && !mapping.id) {
    return { cases: [], warnings: ['Chưa chọn cột "Tên case" (hoặc "Mã").'] };
  }
  type Draft = {
    key: string;
    id: string;
    name: string;
    group: string;
    priority: ManualCase['priority'];
    pre: string;
    steps: { action: string; expected: string }[];
  };
  const drafts: Draft[] = [];
  let cur: Draft | undefined;
  table.rows.forEach((row, i) => {
    const line = i + 2;
    const id = cell(row, 'id');
    const name = cell(row, 'name');
    const key = id || name;
    if (key && key !== cur?.key) {
      const pr = cell(row, 'priority');
      cur = {
        key,
        id,
        name: name || id,
        group: cell(row, 'group'),
        priority: PRIORITY[norm(pr)] ?? 'medium',
        pre: cell(row, 'preconditions'),
        steps: [],
      };
      if (
        pr &&
        !PRIORITY[norm(pr)] &&
        !['trung binh', 'medium', 'tb', '2', 'p2'].includes(norm(pr))
      )
        warnings.push(`Dòng ${line}: không hiểu mức ưu tiên "${pr}", dùng "Trung bình".`);
      drafts.push(cur);
    }
    const action = cell(row, 'action');
    const expected = cell(row, 'expected');
    if (!action && !expected) return;
    if (!cur) {
      warnings.push(`Dòng ${line}: có bước nhưng chưa có case nào ở trên, bỏ qua.`);
      return;
    }
    cur.steps.push({ action, expected });
  });

  const cases: ManualCase[] = [];
  for (const d of drafts) {
    let steps = d.steps;
    if (steps.length === 1 && steps[0]) {
      const a = splitNumbered(steps[0].action);
      const e = splitNumbered(steps[0].expected);
      if (a) {
        const paired = e && e.length === a.length;
        steps = a.map((action, k) => ({
          action,
          expected: paired ? (e[k] ?? '') : k === a.length - 1 ? (steps[0]?.expected ?? '') : '',
        }));
      }
    }
    if (steps.length === 0) warnings.push(`Case "${d.name}" không có bước nào.`);
    const parsed = ManualCaseSchema.safeParse({
      id: newId(),
      name: d.name.slice(0, 300),
      group: d.group,
      preconditions: d.pre,
      priority: d.priority,
      externalId: d.id || undefined,
      steps: steps.map((s) => ({ id: newId(), action: s.action, expected: s.expected })),
    });
    if (parsed.success) cases.push(parsed.data);
    else warnings.push(`Case "${d.name}": ${parsed.error.issues[0]?.message ?? 'không hợp lệ'}.`);
  }
  return { cases, warnings };
}

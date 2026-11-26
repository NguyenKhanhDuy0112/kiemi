import {
  type FieldSpec,
  type FieldType,
  type FormSpec,
  FormSpecSchema,
  RULE_IDS,
} from '@kiemi/schema';
import type { Table } from './table';

/** Template columns of the field-specification file [R-14]. */
export const FIELD_SPEC_COLUMNS = [
  'Ô nhập',
  'Kiểu',
  'Bắt buộc',
  'Tối thiểu',
  'Tối đa',
  'Định dạng',
  'Không trùng',
  'Giá trị mẫu',
  'Lựa chọn',
  'Thông báo lỗi',
] as const;

/** Sample rows: the 5-field form of the spec. */
export const FIELD_SPEC_TEMPLATE: Table = {
  columns: [...FIELD_SPEC_COLUMNS],
  rows: [
    { 'Ô nhập': 'Họ tên', Kiểu: 'Chữ', 'Bắt buộc': 'Có', 'Tối thiểu': '2', 'Tối đa': '50' },
    {
      'Ô nhập': 'Email',
      Kiểu: 'Email',
      'Bắt buộc': 'Có',
      'Tối đa': '100',
      'Không trùng': 'Có',
    },
    { 'Ô nhập': 'Số điện thoại', Kiểu: 'SĐT', 'Định dạng': 'SĐT VN' },
    {
      'Ô nhập': 'Mật khẩu',
      Kiểu: 'Mật khẩu',
      'Bắt buộc': 'Có',
      'Định dạng': 'Mật khẩu mạnh',
      'Tối đa': '32',
    },
    { 'Ô nhập': 'Tuổi', Kiểu: 'Số', 'Bắt buộc': 'Có', 'Tối thiểu': '18', 'Tối đa': '99' },
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

const HEADERS: Record<string, readonly string[]> = {
  label: ['o nhap', 'field', 'ten o', 'ten field', 'truong'],
  type: ['kieu', 'type', 'loai'],
  required: ['bat buoc', 'required'],
  min: ['toi thieu', 'min', 'nho nhat'],
  max: ['toi da', 'max', 'lon nhat'],
  format: ['dinh dang', 'format', 'pattern', 'quy tac'],
  unique: ['khong trung', 'unique'],
  example: ['gia tri mau', 'example', 'mau'],
  options: ['lua chon', 'options', 'danh sach'],
  message: ['thong bao loi', 'message', 'error', 'error message'],
};

const TYPES: Record<string, FieldType> = {
  chu: 'text',
  text: 'text',
  van: 'text',
  'doan van': 'textarea',
  textarea: 'textarea',
  so: 'number',
  number: 'number',
  tien: 'money',
  money: 'money',
  email: 'email',
  sdt: 'phone',
  'so dien thoai': 'phone',
  'dien thoai': 'phone',
  phone: 'phone',
  'mat khau': 'password',
  password: 'password',
  ngay: 'date',
  date: 'date',
  'danh sach': 'dropdown',
  'danh sach chon': 'dropdown',
  dropdown: 'dropdown',
  select: 'dropdown',
  tick: 'checkbox',
  'hop tick': 'checkbox',
  checkbox: 'checkbox',
  file: 'file',
  tep: 'file',
};

const YES = new Set(['co', 'yes', 'y', 'x', 'true', '1', 'c', 'v', '✓', 'bat buoc']);
const isYes = (s: string) => YES.has(norm(s)) || s.trim() === '✓';

/** Human names of library rules typed in the "Định dạng" column. */
const RULE_ALIASES: Record<string, string> = {
  'sdt vn': 'vn-phone',
  'so dien thoai vn': 'vn-phone',
  email: 'email',
  cccd: 'vn-cccd',
  cmnd: 'vn-cccd',
  'ma so thue': 'vn-tax-code',
  mst: 'vn-tax-code',
  'ma buu chinh': 'vn-postal-code',
  url: 'url',
  'mat khau manh': 'strong-password',
  'ho ten': 'vn-fullname',
  'tien vnd': 'vnd-money',
  'tien vn': 'vnd-money',
};

export interface FieldSpecImport {
  form: FormSpec;
  /** Plain-Vietnamese notes about cells that were ignored or fixed. */
  warnings: string[];
}

/** Reads the field-specification table into a form spec for the QC to review [R-14]. */
export function formFromTable(table: Table, name: string, id: string): FieldSpecImport {
  const warnings: string[] = [];
  const col = (key: keyof typeof HEADERS): string | undefined =>
    table.columns.find((c) => HEADERS[key]?.includes(norm(c)));
  const labelCol = col('label') ?? table.columns[0];
  if (!labelCol) return { form: FormSpecSchema.parse({ id, name, fields: [] }), warnings };
  const get = (row: Record<string, string>, key: keyof typeof HEADERS) => {
    const c = col(key);
    return c ? (row[c] ?? '').trim() : '';
  };
  const taken = new Set<string>();
  const fields: FieldSpec[] = [];
  table.rows.forEach((row, i) => {
    const label = (row[labelCol] ?? '').trim();
    if (!label) return;
    const line = i + 2;
    const typeText = get(row, 'type');
    const type = typeText ? TYPES[norm(typeText)] : 'text';
    if (!type) warnings.push(`Dòng ${line}: không hiểu kiểu "${typeText}", dùng "Chữ".`);
    const kind: FieldType = type ?? 'text';
    let key =
      norm(label)
        .replace(/ /g, '_')
        .replace(/^(?=[0-9])/, 'f_')
        .slice(0, 36) || `field_${line}`;
    for (let n = 2; taken.has(key); n++) key = `${key.replace(/_\d+$/, '')}_${n}`;
    taken.add(key);
    const num = (s: string): number | undefined => {
      if (!s) return undefined;
      const n = Number(s.replace(',', '.'));
      if (Number.isFinite(n)) return n;
      warnings.push(`Dòng ${line}: "${s}" không phải số, bỏ qua.`);
      return undefined;
    };
    const min = num(get(row, 'min'));
    const max = num(get(row, 'max'));
    const numeric = kind === 'number' || kind === 'money';
    const format = get(row, 'format');
    const alias = RULE_ALIASES[norm(format)] ?? (RULE_IDS.includes(format) ? format : undefined);
    const options = get(row, 'options')
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const example = get(row, 'example');
    const field: Record<string, unknown> = {
      key,
      label,
      type: kind,
      required: isYes(get(row, 'required')),
      unique: isYes(get(row, 'unique')),
      ruleRefs: alias ? [alias] : [],
      options,
    };
    if (min !== undefined) field[numeric ? 'min' : 'minLength'] = min;
    if (max !== undefined) field[numeric ? 'max' : 'maxLength'] = max;
    if (format && !alias) field.pattern = format;
    if (example) field.example = example;
    if (get(row, 'message'))
      warnings.push(
        `Dòng ${line}: cột "Thông báo lỗi" chưa được nhập vào — sửa ở mục "Thông báo lỗi chuẩn".`,
      );
    fields.push(field as unknown as FieldSpec);
  });
  // Re-parse each field so a bad row is reported, not fatal.
  const good: unknown[] = [];
  for (const f of fields) {
    const one = FormSpecSchema.safeParse({ id, name, fields: [f] });
    if (one.success) good.push(f);
    else
      warnings.push(`Ô "${f.label}": ${one.error.issues[0]?.message ?? 'không hợp lệ'} — bỏ qua.`);
  }
  return { form: FormSpecSchema.parse({ id, name, fields: good }), warnings };
}

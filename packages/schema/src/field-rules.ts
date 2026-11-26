import { z } from 'zod';
import type { AllowedChars, FieldSpec, FieldType } from './form-spec';

/** A value to type into a field that the rule must reject, with the reason in plain Vietnamese [R-04]. */
export interface BadValue {
  value: string;
  why: string;
}

/** A named rule of the shared library, attached to a field by `ruleRefs` [R-10]. */
export interface RuleDef {
  id: string;
  /** Field types the rule makes sense for. */
  appliesTo: readonly FieldType[];
  /** The whole value must match (case-sensitive, Unicode-aware). */
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  allowedChars?: AllowedChars;
  /** Values that must be accepted. */
  valid: readonly string[];
  /** Values that must be rejected, each with the reason. */
  invalid: readonly BadValue[];
}

const TEXTY: readonly FieldType[] = ['text', 'textarea', 'email', 'phone', 'password'];

/** Rules every project gets: Vietnamese formats and common ones [R-10]. */
export const BUILTIN_RULES: readonly RuleDef[] = [
  {
    id: 'email',
    appliesTo: ['text', 'email'],
    pattern: '[A-Za-z0-9._%+\\-]+@[A-Za-z0-9\\-]+(\\.[A-Za-z0-9\\-]+)*\\.[A-Za-z]{2,}',
    maxLength: 254,
    valid: ['a@b.vn', 'nguyen.van+test@mail.example.com'],
    invalid: [
      { value: 'abc', why: 'Thiếu ký tự @' },
      { value: 'a@b', why: 'Thiếu tên miền (.com, .vn…)' },
      { value: '@b.com', why: 'Thiếu phần trước @' },
      { value: 'a b@c.com', why: 'Có khoảng trắng' },
    ],
  },
  {
    id: 'vn-phone',
    appliesTo: ['text', 'phone'],
    pattern: '0[0-9]{9}',
    minLength: 10,
    maxLength: 10,
    allowedChars: 'digits',
    valid: ['0901234567', '0381234567'],
    invalid: [
      { value: '090123456', why: 'Thiếu 1 số (9 số)' },
      { value: '09012345678', why: 'Thừa 1 số (11 số)' },
      { value: '1901234567', why: 'Không bắt đầu bằng số 0' },
      { value: '09012345ab', why: 'Có chữ cái' },
    ],
  },
  {
    id: 'vn-cccd',
    appliesTo: ['text'],
    pattern: '[0-9]{12}',
    minLength: 12,
    maxLength: 12,
    allowedChars: 'digits',
    valid: ['001201012345', '079090123456'],
    invalid: [
      { value: '00120101234', why: 'Thiếu 1 số (11 số)' },
      { value: '0012010123456', why: 'Thừa 1 số (13 số)' },
      { value: '00120101234a', why: 'Có chữ cái' },
    ],
  },
  {
    id: 'vn-tax-code',
    appliesTo: ['text'],
    pattern: '[0-9]{10}([0-9]{3}|-[0-9]{3})?',
    minLength: 10,
    maxLength: 14,
    valid: ['0312345678', '0312345678001', '0312345678-001'],
    invalid: [
      { value: '031234567', why: 'Thiếu số (9 số)' },
      { value: '03123456789', why: 'Sai độ dài (11 số)' },
      { value: '031234567890', why: 'Sai độ dài (12 số)' },
      { value: '03123456ab', why: 'Có chữ cái' },
    ],
  },
  {
    id: 'vn-postal-code',
    appliesTo: ['text'],
    pattern: '[0-9]{6}',
    minLength: 6,
    maxLength: 6,
    allowedChars: 'digits',
    valid: ['100000', '700000'],
    invalid: [
      { value: '10000', why: 'Thiếu 1 số (5 số)' },
      { value: '1000000', why: 'Thừa 1 số (7 số)' },
      { value: '10000a', why: 'Có chữ cái' },
    ],
  },
  {
    id: 'url',
    appliesTo: ['text'],
    pattern: 'https?://[^\\s/]+\\.[^\\s]+',
    valid: ['https://example.com', 'http://example.com/a?b=1'],
    invalid: [
      { value: 'example.com', why: 'Thiếu http:// hoặc https://' },
      { value: 'https://', why: 'Thiếu địa chỉ' },
      { value: 'https://exa mple.com', why: 'Có khoảng trắng' },
    ],
  },
  {
    id: 'strong-password',
    appliesTo: ['password', 'text'],
    pattern: '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}',
    minLength: 8,
    valid: ['Abcdef1!', 'Mat-khau-Manh9'],
    invalid: [
      { value: 'abcdefgh', why: 'Thiếu chữ hoa, số, ký tự đặc biệt' },
      { value: 'ABCDEFGH1!', why: 'Thiếu chữ thường' },
      { value: 'Abcdefg1', why: 'Thiếu ký tự đặc biệt' },
      { value: 'Ab1!', why: 'Quá ngắn (dưới 8 ký tự)' },
    ],
  },
  {
    id: 'vn-fullname',
    appliesTo: TEXTY,
    pattern: "\\p{L}+([ '\\-]\\p{L}+)+",
    minLength: 2,
    maxLength: 100,
    valid: ['Nguyễn Thị Ánh', 'Trần Văn A', "O'Brien Lê"],
    invalid: [
      { value: 'Nguyen123', why: 'Có chữ số' },
      { value: 'Nguyễn', why: 'Chỉ có một từ (thiếu họ hoặc tên)' },
      { value: 'Nguyễn@Anh', why: 'Có ký tự đặc biệt' },
    ],
  },
  {
    id: 'vnd-money',
    appliesTo: ['money', 'number', 'text'],
    pattern: '[0-9]{1,3}(\\.[0-9]{3})+|[0-9]+',
    min: 0,
    valid: ['0', '1000000', '1.000.000'],
    invalid: [
      { value: '-1000', why: 'Số âm' },
      { value: '1,5', why: 'Dùng dấu phẩy thập phân (tiền VNĐ là số nguyên)' },
      { value: '1.00', why: 'Sai cách ngăn nghìn' },
      { value: 'abc', why: 'Không phải số' },
    ],
  },
];

export const RULE_IDS = BUILTIN_RULES.map((r) => r.id);

export const ruleById = (id: string): RuleDef | undefined => BUILTIN_RULES.find((r) => r.id === id);

/** Rules offered for a field type. */
export const rulesFor = (type: FieldType): RuleDef[] =>
  BUILTIN_RULES.filter((r) => r.appliesTo.includes(type));

/** True when the whole `value` matches the rule's pattern and length limits. */
export function matchesRule(rule: RuleDef, value: string): boolean {
  if (rule.minLength !== undefined && value.length < rule.minLength) return false;
  if (rule.maxLength !== undefined && value.length > rule.maxLength) return false;
  if (rule.pattern !== undefined && !new RegExp(`^(?:${rule.pattern})$`, 'u').test(value))
    return false;
  if (rule.min !== undefined && Number(value.replace(/\./g, '')) < rule.min) return false;
  return true;
}

/** What a field must satisfy once its attached rules are applied: its own settings win over a rule's. */
export interface EffectiveRules {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  allowedChars: AllowedChars;
  /** The value must match every one of these (the field's own pattern first). */
  patterns: string[];
  rules: RuleDef[];
}

export function effectiveRules(field: FieldSpec): EffectiveRules {
  const rules = field.ruleRefs.map(ruleById).filter((r): r is RuleDef => r !== undefined);
  const first = <K extends 'minLength' | 'maxLength' | 'min' | 'max'>(k: K): number | undefined =>
    field[k] ?? rules.find((r) => r[k] !== undefined)?.[k];
  const minLength = first('minLength');
  const maxLength = first('maxLength');
  const min = first('min');
  const max = first('max');
  const chars =
    field.allowedChars !== 'any'
      ? field.allowedChars
      : (rules.find((r) => r.allowedChars)?.allowedChars ?? 'any');
  return {
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    allowedChars: chars,
    patterns: [
      ...(field.pattern ? [field.pattern] : []),
      ...rules.flatMap((r) => (r.pattern ? [r.pattern] : [])),
    ],
    rules,
  };
}

/* ---------- Message catalog [R-10, R-05] ---------- */

/** Default error messages, `{field}` `{min}` `{max}` `{other}` `{types}` `{size}` are filled in. */
export const DEFAULT_MESSAGES: Readonly<Record<string, string>> = {
  required: '{field} là bắt buộc',
  minLength: '{field} phải có ít nhất {min} ký tự',
  maxLength: '{field} không được vượt quá {max} ký tự',
  min: '{field} phải từ {min} trở lên',
  max: '{field} không được lớn hơn {max}',
  pattern: '{field} không đúng định dạng',
  allowedChars: '{field} chứa ký tự không hợp lệ',
  unique: '{field} đã tồn tại',
  'compare.eq': '{field} phải trùng với {other}',
  'compare.neq': '{field} phải khác {other}',
  'compare.gt': '{field} phải lớn hơn {other}',
  'compare.gte': '{field} phải lớn hơn hoặc bằng {other}',
  'compare.lt': '{field} phải nhỏ hơn {other}',
  'compare.lte': '{field} phải nhỏ hơn hoặc bằng {other}',
  fileType: '{field} chỉ nhận file {types}',
  fileSize: '{field} không được quá {size} KB',
  'format.email': 'Email không hợp lệ',
  'format.vn-phone': 'Số điện thoại không hợp lệ',
  'format.vn-cccd': 'Số CCCD phải gồm 12 chữ số',
  'format.vn-tax-code': 'Mã số thuế phải gồm 10 hoặc 13 chữ số',
  'format.vn-postal-code': 'Mã bưu chính phải gồm 6 chữ số',
  'format.url': 'Địa chỉ web không hợp lệ',
  'format.strong-password':
    'Mật khẩu phải có ít nhất 8 ký tự gồm chữ hoa, chữ thường, số và ký tự đặc biệt',
  'format.vn-fullname': 'Họ tên không hợp lệ',
  'format.vnd-money': 'Số tiền không hợp lệ',
};

/** Messages the project changed, by catalog key. */
export const MessageCatalogSchema = z.record(z.string().min(1), z.string().min(1));
export type MessageCatalog = z.infer<typeof MessageCatalogSchema>;

/** The template for `key`: the project's own, else the default, else the generic format one. */
export function messageTemplate(key: string, overrides: MessageCatalog = {}): string {
  return overrides[key] ?? DEFAULT_MESSAGES[key] ?? DEFAULT_MESSAGES.pattern ?? '{field}';
}

/** Fills `{name}` placeholders; unknown ones stay as written. */
export function formatMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Expected text of the error for one rule of one field. */
export function expectedMessage(
  key: string,
  field: Pick<FieldSpec, 'label'>,
  params: Record<string, string | number> = {},
  overrides: MessageCatalog = {},
): string {
  return formatMessage(messageTemplate(key, overrides), { field: field.label, ...params });
}

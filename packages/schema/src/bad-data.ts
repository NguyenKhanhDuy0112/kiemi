import type { FieldSpec } from './form-spec';

/** What the form must do with a bad value: reject it, accept it (trimmed…), or just survive it. */
export type BadOutcome = 'accept' | 'reject' | 'safe';

export interface BadDatum {
  id: string;
  /** Plain-Vietnamese name shown in lists and reports. */
  label: string;
  /** Value to type; computed from the field when it depends on its limits. */
  value: (f: FieldSpec) => string;
  /** `safe` = no crash, no error page, nothing executed. */
  outcome: (f: FieldSpec, required: boolean) => BadOutcome;
  appliesTo: (f: FieldSpec) => boolean;
}

const textLike = (f: FieldSpec) =>
  ['text', 'textarea', 'password', 'email', 'phone'].includes(f.type);
const numeric = (f: FieldSpec) => f.type === 'number' || f.type === 'money';
const nfc = 'Nguyễn Thị Ánh';

/** The standard "bad data" set [R-04]. */
export const BAD_DATA: readonly BadDatum[] = [
  {
    id: 'whitespace-only',
    label: 'Chỉ có khoảng trắng',
    value: () => '   ',
    outcome: (_f, required) => (required ? 'reject' : 'safe'),
    appliesTo: textLike,
  },
  {
    id: 'whitespace-edges',
    label: 'Khoảng trắng đầu và cuối',
    value: () => `  ${nfc}  `,
    outcome: () => 'accept',
    appliesTo: (f) => f.type === 'text' || f.type === 'textarea',
  },
  {
    id: 'vietnamese-nfc',
    label: 'Tiếng Việt có dấu (Unicode dựng sẵn NFC)',
    value: () => nfc.normalize('NFC'),
    outcome: () => 'accept',
    appliesTo: (f) => f.type === 'text' || f.type === 'textarea',
  },
  {
    id: 'vietnamese-nfd',
    label: 'Tiếng Việt có dấu (Unicode tổ hợp NFD)',
    value: () => nfc.normalize('NFD'),
    outcome: () => 'accept',
    appliesTo: (f) => f.type === 'text' || f.type === 'textarea',
  },
  {
    id: 'emoji',
    label: 'Ký tự emoji',
    value: () => 'An 😀👍',
    outcome: () => 'safe',
    appliesTo: (f) => f.type === 'text' || f.type === 'textarea',
  },
  {
    id: 'special-chars',
    label: 'Ký tự đặc biệt',
    value: () => '!@#$%^&*()_+{}|:"<>?~`',
    outcome: () => 'safe',
    appliesTo: textLike,
  },
  {
    id: 'very-long',
    label: 'Chuỗi rất dài (10.000 ký tự)',
    value: () => 'a'.repeat(10_000),
    outcome: (f) => (f.maxLength === undefined ? 'safe' : 'reject'),
    appliesTo: textLike,
  },
  {
    id: 'paste-over-max',
    label: 'Dán vượt giới hạn độ dài',
    value: (f) => 'a'.repeat((f.maxLength ?? 0) + 20),
    outcome: () => 'safe',
    appliesTo: (f) => textLike(f) && f.maxLength !== undefined,
  },
  {
    id: 'script-tag',
    label: 'Thẻ <script> (XSS)',
    value: () => '<script>alert(1)</script>',
    outcome: () => 'safe',
    appliesTo: textLike,
  },
  {
    id: 'html-tag',
    label: 'Thẻ HTML',
    value: () => '<b>đậm</b><img src=x onerror=alert(1)>',
    outcome: () => 'safe',
    appliesTo: textLike,
  },
  {
    id: 'sql-injection',
    label: "Chuỗi SQL injection (' OR 1=1--)",
    value: () => "' OR 1=1--",
    outcome: () => 'safe',
    appliesTo: textLike,
  },
  {
    id: 'negative-number',
    label: 'Số âm',
    value: () => '-5',
    outcome: (f) => (f.min !== undefined && f.min > -5 ? 'reject' : 'safe'),
    appliesTo: numeric,
  },
  {
    id: 'zero',
    label: 'Số 0',
    value: () => '0',
    outcome: (f) => (f.min !== undefined && f.min > 0 ? 'reject' : 'safe'),
    appliesTo: numeric,
  },
  {
    id: 'decimal',
    label: 'Số thập phân',
    value: () => '1.5',
    outcome: (f) => (f.type === 'money' ? 'reject' : 'safe'),
    appliesTo: numeric,
  },
  {
    id: 'scientific',
    label: 'Ký hiệu khoa học (1e3)',
    value: () => '1e3',
    outcome: () => 'safe',
    appliesTo: numeric,
  },
  {
    id: 'leading-zeros',
    label: 'Số 0 đầu (007)',
    value: () => '007',
    outcome: () => 'safe',
    appliesTo: numeric,
  },
  {
    id: 'huge-number',
    label: 'Số rất lớn',
    value: () => '99999999999999999999',
    outcome: (f) => (f.max !== undefined ? 'reject' : 'safe'),
    appliesTo: numeric,
  },
  {
    id: 'date-31-feb',
    label: 'Ngày không tồn tại (31/02)',
    value: () => '2025-02-31',
    outcome: () => 'reject',
    appliesTo: (f) => f.type === 'date',
  },
  {
    id: 'date-29-feb-common',
    label: '29/02 của năm không nhuận',
    value: () => '2025-02-29',
    outcome: () => 'reject',
    appliesTo: (f) => f.type === 'date',
  },
  {
    id: 'date-29-feb-leap',
    label: '29/02 của năm nhuận (hợp lệ)',
    value: () => '2024-02-29',
    outcome: () => 'accept',
    appliesTo: (f) => f.type === 'date',
  },
];

/** Bad-data values that apply to a field. */
export const badDataFor = (f: FieldSpec): BadDatum[] =>
  f.badData && !f.readOnly ? BAD_DATA.filter((d) => d.appliesTo(f)) : [];

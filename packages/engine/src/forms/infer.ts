import {
  type FieldSpec,
  type FieldType,
  type FormSpec,
  FormSpecSchema,
  type Locator,
} from '@kiemi/schema';
import type { ScannedControl, ScannedForm } from './scan';

const has = (c: ScannedControl, re: RegExp) =>
  re.test(`${c.name} ${c.id} ${c.label} ${c.placeholder}`.toLowerCase());

/** Field type from the HTML type, then from the name/label when the input is plain text. */
export function inferType(c: ScannedControl): FieldType {
  switch (c.type) {
    case 'email':
      return 'email';
    case 'tel':
      return 'phone';
    case 'password':
      return 'password';
    case 'number':
    case 'range':
      return has(c, /tiền|tien|giá|gia|price|amount|money|lương|luong/) ? 'money' : 'number';
    case 'date':
    case 'datetime-local':
    case 'month':
    case 'week':
    case 'time':
      return 'date';
    case 'checkbox':
      return 'checkbox';
    case 'radio':
    case 'select':
      return 'dropdown';
    case 'file':
      return 'file';
    case 'textarea':
      return 'textarea';
  }
  if (has(c, /e-?mail/)) return 'email';
  if (has(c, /phone|\bsdt\b|điện thoại|dien thoai|mobile|\btel\b/)) return 'phone';
  if (has(c, /password|mật khẩu|mat khau/)) return 'password';
  if (has(c, /tiền|tien|price|amount|số tiền|so tien/)) return 'money';
  return 'text';
}

/** Characters hint from a numeric-looking pattern: `[0-9]*`, `\d+` … */
function allowedFromPattern(p: string | null): FieldSpec['allowedChars'] {
  if (!p) return 'any';
  return /^(\^)?(\\d|\[0-9\])[*+{\d,}]*\$?$/.test(p) ? 'digits' : 'any';
}

const asNumber = (s: string | null): number | undefined => {
  if (s === null || s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

function locatorOf(c: ScannedControl): Locator {
  return {
    strategies: [
      ...(c.label ? [{ kind: 'label' as const, value: c.label }] : []),
      ...(c.placeholder ? [{ kind: 'placeholder' as const, value: c.placeholder }] : []),
      { kind: 'css' as const, value: c.css },
    ],
  };
}

function validPattern(p: string | null): string | undefined {
  if (!p) return undefined;
  try {
    new RegExp(`^(?:${p})$`, 'u');
    return p;
  } catch {
    return undefined;
  }
}

/** Key from the control's name/id/label: letters, digits and `_`, unique in the form. */
export function keyOf(c: ScannedControl, taken: Set<string>): string {
  const raw = c.name || c.id || c.label || 'field';
  let base = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  if (!/^[A-Za-z_]/.test(base)) base = `f_${base}`.replace(/_$/, '');
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  taken.add(key);
  return key;
}

/** One scanned input → field spec (only what the HTML says; the QC reviews the rest). */
export function inferField(c: ScannedControl, taken: Set<string>): FieldSpec {
  const type = inferType(c);
  const numeric = type === 'number' || type === 'money';
  const min = numeric ? asNumber(c.min) : undefined;
  const max = numeric ? asNumber(c.max) : undefined;
  const pattern = validPattern(c.pattern);
  const f: FieldSpec = {
    key: keyOf(c, taken),
    label: c.label || c.placeholder || c.name || c.id || 'Field',
    type,
    locator: locatorOf(c),
    required: c.required || c.labelStar,
    allowedChars: allowedFromPattern(c.pattern),
    unique: false,
    readOnly: c.readOnly,
    options: type === 'dropdown' ? c.options : [],
    ruleRefs: [],
    ...(c.minLength !== null && !numeric ? { minLength: c.minLength } : {}),
    ...(c.maxLength !== null && !numeric ? { maxLength: c.maxLength } : {}),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(pattern === undefined ? {} : { pattern }),
    ...(c.value && type !== 'password' && type !== 'file' ? { defaultValue: c.value } : {}),
    ...(type === 'file'
      ? {
          file: {
            extensions: (c.accept ?? '')
              .split(',')
              .map((x) => x.trim().replace(/^\./, ''))
              .filter((x) => x && !x.includes('/') && !x.includes('*')),
          },
        }
      : {}),
  };
  // "Confirm password" style fields: must equal the previous password field.
  return f;
}

/** `Xác nhận mật khẩu` right after a password → compare equal to it. */
function addComparisons(fields: FieldSpec[]): FieldSpec[] {
  return fields.map((f, i) => {
    if (f.type !== 'password' || i === 0) return f;
    const prev = fields[i - 1];
    if (prev?.type === 'password') return { ...f, compare: { field: prev.key, op: 'eq' as const } };
    return f;
  });
}

/** A scanned page form → form spec ready for the QC to review. */
export function inferForm(scan: ScannedForm, id: string, path?: string): FormSpec {
  const taken = new Set<string>();
  const fields = addComparisons(scan.controls.map((c) => inferField(c, taken)));
  return FormSpecSchema.parse({
    id,
    name: scan.name || 'Form',
    ...(path ? { path } : {}),
    fields,
  });
}

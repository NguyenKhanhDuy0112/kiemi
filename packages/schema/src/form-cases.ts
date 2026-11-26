import {
  type BadValue,
  type EffectiveRules,
  effectiveRules,
  type RuleDef,
  ruleById,
} from './field-rules';
import type { FieldCondition, FieldSpec, FormSpec } from './form-spec';

/** Standard test-design technique a case comes from [R-03]. */
export type CaseTechnique = 'valid' | 'equivalence' | 'boundary' | 'decision' | 'pairwise';

/** One generated case: values for the whole form, only one field wrong at a time [R-03]. */
export interface FormCase {
  /** Stable: `valid`, `<field>:<rule>`; used to keep the tester's selection. */
  id: string;
  name: string;
  technique: CaseTechnique;
  /** Key of the field this case breaks (or probes); none for the all-valid and pairwise cases. */
  field?: string;
  /** What the form should do. */
  expect: 'accept' | 'reject';
  /** Catalog key of the error expected on `field` ("required", "minLength", "format.vn-phone"…). */
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  /** Value typed per field key; fields hidden by their conditions are left out. */
  values: Record<string, string>;
  /** Fields that must not be shown in this case. */
  hidden?: string[];
  /** The valid form is sent twice (to see a duplicate rejected). */
  repeat?: boolean;
  /** Plain-Vietnamese reason, shown in the case list and reports. */
  why: string;
  /** Ticked by default; the tester can untick or tick others. */
  selected: boolean;
}

const pad = (ch: string, n: number) => ch.repeat(Math.max(0, n));

/** Filler character that the field accepts. */
function fillerChar(f: FieldSpec, eff: EffectiveRules): string {
  if (eff.allowedChars === 'digits' || f.type === 'number' || f.type === 'money') return '1';
  return 'a';
}

const isoDay = (offset: number): string => {
  const d = new Date(Date.UTC(2025, 5, 15 + offset));
  return d.toISOString().slice(0, 10);
};

/** True when the other field's value satisfies a condition. */
export function conditionHolds(c: FieldCondition, values: Record<string, string>): boolean {
  const v = values[c.field] ?? '';
  switch (c.op) {
    case 'equals':
      return v === (c.value ?? '');
    case 'notEquals':
      return v !== (c.value ?? '');
    case 'filled':
      return v.trim() !== '';
    case 'empty':
      return v.trim() === '';
  }
}

const isVisible = (f: FieldSpec, values: Record<string, string>) =>
  !f.visibleWhen || conditionHolds(f.visibleWhen, values);
const isRequired = (f: FieldSpec, values: Record<string, string>) =>
  f.required || (f.requiredWhen !== undefined && conditionHolds(f.requiredWhen, values));

/** A value the field accepts. */
export function validValue(f: FieldSpec): string {
  if (f.example !== undefined) return f.example;
  const eff = effectiveRules(f);
  const ruled = eff.rules.find((r) => r.valid.length > 0);
  if (ruled) return ruled.valid[0] ?? '';
  switch (f.type) {
    case 'dropdown':
      return f.options[0] ?? '';
    case 'checkbox':
      return 'true';
    case 'file':
      return `sample.${f.file?.extensions[0] ?? 'pdf'}`;
    case 'email':
      return 'qa.test@example.com';
    case 'phone':
      return '0901234567';
    case 'password':
      return pad('Ab1!', 1) + pad('x', Math.max(5, (eff.minLength ?? 8) - 3));
    case 'date':
      return isoDay(0);
    case 'number':
    case 'money': {
      const lo = eff.min ?? 0;
      const hi = eff.max ?? lo + 100;
      return String(Math.min(Math.max(lo + 1, lo), hi));
    }
    default: {
      const ch = fillerChar(f, eff);
      const n = Math.min(Math.max(eff.minLength ?? 6, 1), eff.maxLength ?? 6);
      return ch === '1'
        ? pad('1', n)
        : `${pad('a', n - 1)}b`.replace(/^(.)/, (m) => m.toUpperCase());
    }
  }
}

/** Valid values for every field, honouring conditions and comparisons. */
export function validValues(form: FormSpec): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of form.fields) values[f.key] = validValue(f);
  // Controllers take the value that switches their dependants on.
  for (const f of form.fields) {
    for (const c of [f.visibleWhen, f.requiredWhen]) {
      if (c?.op === 'equals' && c.value !== undefined) values[c.field] = c.value;
    }
  }
  for (const f of form.fields) {
    if (!f.compare) continue;
    const other = values[f.compare.field] ?? '';
    values[f.key] = shifted(other, f.compare.op, true);
  }
  for (const f of form.fields) if (!isVisible(f, values)) delete values[f.key];
  return values;
}

/** A value that is (valid=true) or is not (valid=false) in relation `op` to `other`. */
function shifted(
  other: string,
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte',
  valid: boolean,
): string {
  const n = Number(other);
  const numeric = other.trim() !== '' && Number.isFinite(n);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(other);
  const bump = (d: number) =>
    date
      ? isoDay(
          Math.round((Date.parse(`${other}T00:00:00Z`) - Date.UTC(2025, 5, 15)) / 86_400_000) + d,
        )
      : numeric
        ? String(n + d)
        : `${other}${d > 0 ? 'x' : ''}`;
  const want: Record<typeof op, [number, number]> = {
    eq: [0, 1],
    neq: [1, 0],
    gt: [1, 0],
    gte: [0, -1],
    lt: [-1, 0],
    lte: [0, 1],
  };
  const [ok, bad] = want[op];
  if (!numeric && !date)
    return valid ? (op === 'neq' ? `${other}x` : other) : op === 'neq' ? other : `${other}x`;
  return bump(valid ? ok : bad);
}

const label = (f: FieldSpec) => f.label || f.key;

/** Rule ids a field type brings by itself (an email field is checked as an email). */
function implicitRules(f: FieldSpec): RuleDef[] {
  const ids = f.type === 'email' ? ['email'] : f.type === 'phone' ? ['vn-phone'] : [];
  return ids
    .filter((id) => !f.ruleRefs.includes(id))
    .map(ruleById)
    .filter((r): r is RuleDef => r !== undefined);
}

function matchesAll(value: string, patterns: string[]): boolean {
  return patterns.every((p) => {
    try {
      return new RegExp(`^(?:${p})$`, 'u').test(value);
    } catch {
      return false;
    }
  });
}

/** All-pairs selection (greedy): every pair of values of two factors appears at least once. */
export function pairwise(factors: { key: string; values: string[] }[]): Record<string, string>[] {
  const fs = factors.filter((f) => f.values.length > 1);
  if (fs.length < 2) return [];
  const pairKey = (a: number, av: string, b: number, bv: string) =>
    `${a}\u0000${av}\u0001${b}\u0000${bv}`;
  const uncovered = new Set<string>();
  for (let a = 0; a < fs.length; a++)
    for (let b = a + 1; b < fs.length; b++)
      for (const av of fs[a]?.values ?? [])
        for (const bv of fs[b]?.values ?? []) uncovered.add(pairKey(a, av, b, bv));
  const rows: string[][] = [];
  while (uncovered.size) {
    const row: string[] = [];
    fs.forEach((f, i) => {
      let best = f.values[0] ?? '';
      let bestGain = -1;
      for (const v of f.values) {
        let gain = 0;
        for (let j = 0; j < i; j++) if (uncovered.has(pairKey(j, row[j] ?? '', i, v))) gain++;
        if (i === 0)
          for (let b = 1; b < fs.length; b++)
            for (const bv of fs[b]?.values ?? []) if (uncovered.has(pairKey(0, v, b, bv))) gain++;
        if (gain > bestGain) {
          bestGain = gain;
          best = v;
        }
      }
      row.push(best);
    });
    let covered = 0;
    for (let a = 0; a < fs.length; a++)
      for (let b = a + 1; b < fs.length; b++)
        if (uncovered.delete(pairKey(a, row[a] ?? '', b, row[b] ?? ''))) covered++;
    if (covered === 0) {
      // Safety net: take any remaining pair directly.
      const first = uncovered.values().next().value as string;
      uncovered.delete(first);
      continue;
    }
    rows.push(row);
  }
  return rows.map((r) => Object.fromEntries(fs.map((f, i) => [f.key, r[i] ?? ''])));
}

/**
 * The case list of a form [R-03]: one all-valid case, then one case per broken
 * rule of a single field (equivalence classes + boundary values), decision-table
 * cases for dependent fields, and pairwise combinations of the choice fields.
 */
export function generateFormCases(form: FormSpec): FormCase[] {
  const base = validValues(form);
  const cases: FormCase[] = [
    {
      id: 'valid',
      name: 'Tất cả hợp lệ',
      technique: 'valid',
      expect: 'accept',
      values: base,
      why: 'Mọi ô nhập đúng quy tắc: form phải được gửi thành công.',
      selected: true,
    },
  ];
  const add = (
    c: Omit<FormCase, 'values' | 'selected'> & {
      values?: Record<string, string>;
      selected?: boolean;
    },
  ) => cases.push({ values: base, selected: c.expect === 'reject', ...c });
  const withValue = (key: string, value: string) => ({ ...base, [key]: value });

  for (const f of form.fields) {
    if (f.readOnly || !(f.key in base)) continue;
    const L = label(f);
    const eff = effectiveRules(f);
    const rules = [...eff.rules, ...implicitRules(f)];
    const patterns = [
      ...eff.patterns,
      ...implicitRules(f).flatMap((r) => (r.pattern ? [r.pattern] : [])),
    ];
    const ruleLength = rules.some((r) => r.pattern !== undefined) || f.pattern !== undefined;

    if (isRequired(f, base)) {
      add({
        id: `${f.key}:required`,
        name: `${L}: bỏ trống`,
        technique: 'equivalence',
        field: f.key,
        expect: 'reject',
        messageKey: 'required',
        values: withValue(f.key, f.type === 'checkbox' ? 'false' : ''),
        why: `${L} là bắt buộc nhưng để trống.`,
      });
    }

    const texty = ['text', 'textarea', 'password'].includes(f.type);
    if (texty && !ruleLength) {
      const ch = fillerChar(f, eff);
      const of = (n: number) => (n <= 0 ? '' : pad(ch, n));
      if (eff.minLength !== undefined && eff.minLength > 0) {
        add({
          id: `${f.key}:minLength.below`,
          name: `${L}: ngắn hơn tối thiểu (${eff.minLength - 1} ký tự)`,
          technique: 'boundary',
          field: f.key,
          expect: 'reject',
          messageKey: 'minLength',
          messageParams: { min: eff.minLength },
          values: withValue(f.key, of(eff.minLength - 1)),
          why: `Tối thiểu ${eff.minLength} ký tự, nhập ${eff.minLength - 1}.`,
        });
        add({
          id: `${f.key}:minLength.at`,
          name: `${L}: đúng tối thiểu (${eff.minLength} ký tự)`,
          technique: 'boundary',
          field: f.key,
          expect: 'accept',
          values: withValue(f.key, of(eff.minLength)),
          why: `Đúng ${eff.minLength} ký tự: còn hợp lệ.`,
        });
        add({
          id: `${f.key}:minLength.above`,
          name: `${L}: hơn tối thiểu 1 (${eff.minLength + 1} ký tự)`,
          technique: 'boundary',
          field: f.key,
          expect: 'accept',
          values: withValue(f.key, of(eff.minLength + 1)),
          why: `${eff.minLength + 1} ký tự: hợp lệ.`,
          selected: false,
        });
      }
      if (eff.maxLength !== undefined) {
        add({
          id: `${f.key}:maxLength.below`,
          name: `${L}: kém tối đa 1 (${eff.maxLength - 1} ký tự)`,
          technique: 'boundary',
          field: f.key,
          expect: 'accept',
          values: withValue(f.key, of(eff.maxLength - 1)),
          why: `${eff.maxLength - 1} ký tự: hợp lệ.`,
          selected: false,
        });
        add({
          id: `${f.key}:maxLength.at`,
          name: `${L}: đúng tối đa (${eff.maxLength} ký tự)`,
          technique: 'boundary',
          field: f.key,
          expect: 'accept',
          values: withValue(f.key, of(eff.maxLength)),
          why: `Đúng ${eff.maxLength} ký tự: còn hợp lệ.`,
        });
        add({
          id: `${f.key}:maxLength.above`,
          name: `${L}: vượt tối đa (${eff.maxLength + 1} ký tự)`,
          technique: 'boundary',
          field: f.key,
          expect: 'reject',
          messageKey: 'maxLength',
          messageParams: { max: eff.maxLength },
          values: withValue(f.key, of(eff.maxLength + 1)),
          why: `Tối đa ${eff.maxLength} ký tự, nhập ${eff.maxLength + 1}.`,
        });
      }
    }

    if (f.type === 'number' || f.type === 'money') {
      const num = (n: number) => String(n);
      if (eff.min !== undefined) {
        add({
          id: `${f.key}:min.below`,
          name: `${L}: nhỏ hơn giá trị nhỏ nhất (${num(eff.min - 1)})`,
          technique: 'boundary',
          field: f.key,
          expect: 'reject',
          messageKey: 'min',
          messageParams: { min: eff.min },
          values: withValue(f.key, num(eff.min - 1)),
          why: `Nhỏ nhất là ${eff.min}, nhập ${eff.min - 1}.`,
        });
        add({
          id: `${f.key}:min.at`,
          name: `${L}: đúng giá trị nhỏ nhất (${num(eff.min)})`,
          technique: 'boundary',
          field: f.key,
          expect: 'accept',
          values: withValue(f.key, num(eff.min)),
          why: `Đúng ${eff.min}: còn hợp lệ.`,
        });
        add({
          id: `${f.key}:min.above`,
          name: `${L}: hơn giá trị nhỏ nhất 1 (${num(eff.min + 1)})`,
          technique: 'boundary',
          field: f.key,
          expect: 'accept',
          values: withValue(f.key, num(eff.min + 1)),
          why: `${eff.min + 1}: hợp lệ.`,
          selected: false,
        });
      }
      if (eff.max !== undefined) {
        add({
          id: `${f.key}:max.below`,
          name: `${L}: kém giá trị lớn nhất 1 (${num(eff.max - 1)})`,
          technique: 'boundary',
          field: f.key,
          expect: 'accept',
          values: withValue(f.key, num(eff.max - 1)),
          why: `${eff.max - 1}: hợp lệ.`,
          selected: false,
        });
        add({
          id: `${f.key}:max.at`,
          name: `${L}: đúng giá trị lớn nhất (${num(eff.max)})`,
          technique: 'boundary',
          field: f.key,
          expect: 'accept',
          values: withValue(f.key, num(eff.max)),
          why: `Đúng ${eff.max}: còn hợp lệ.`,
        });
        add({
          id: `${f.key}:max.above`,
          name: `${L}: lớn hơn giá trị lớn nhất (${num(eff.max + 1)})`,
          technique: 'boundary',
          field: f.key,
          expect: 'reject',
          messageKey: 'max',
          messageParams: { max: eff.max },
          values: withValue(f.key, num(eff.max + 1)),
          why: `Lớn nhất là ${eff.max}, nhập ${eff.max + 1}.`,
        });
      }
      if (!rules.length) {
        add({
          id: `${f.key}:notNumber`,
          name: `${L}: không phải số`,
          technique: 'equivalence',
          field: f.key,
          expect: 'reject',
          messageKey: 'pattern',
          values: withValue(f.key, 'abc'),
          why: 'Nhập chữ vào ô số.',
        });
      }
    }

    // One case per known-bad value of each attached / implicit rule.
    for (const r of rules) {
      r.invalid.forEach((b: BadValue, i: number) => {
        add({
          id: `${f.key}:format.${r.id}.${i + 1}`,
          name: `${L}: ${b.why.charAt(0).toLowerCase()}${b.why.slice(1)} (${b.value})`,
          technique: 'equivalence',
          field: f.key,
          expect: 'reject',
          messageKey: `format.${r.id}`,
          values: withValue(f.key, b.value),
          why: b.why,
          selected: i === 0 || r.invalid.length <= 2,
        });
      });
    }
    if (f.pattern && !rules.some((r) => r.pattern === f.pattern)) {
      const bad = ['@@##', 'ký tự lạ'].find((v) => !matchesAll(v, patterns));
      if (bad)
        add({
          id: `${f.key}:pattern`,
          name: `${L}: sai định dạng`,
          technique: 'equivalence',
          field: f.key,
          expect: 'reject',
          messageKey: 'pattern',
          values: withValue(f.key, bad),
          why: `Không khớp định dạng ${f.pattern}.`,
        });
    }

    const charBad = { digits: 'abc', letters: '123', alnum: '!@#', 'no-special': '!@#', any: '' }[
      eff.allowedChars
    ];
    if (eff.allowedChars !== 'any' && !rules.length && texty) {
      add({
        id: `${f.key}:allowedChars`,
        name: `${L}: ký tự không cho phép (${charBad})`,
        technique: 'equivalence',
        field: f.key,
        expect: 'reject',
        messageKey: 'allowedChars',
        values: withValue(f.key, charBad),
        why: 'Có ký tự ngoài phạm vi cho phép.',
      });
    }

    if (f.unique) {
      add({
        id: `${f.key}:unique`,
        name: `${L}: trùng giá trị đã có`,
        technique: 'equivalence',
        field: f.key,
        expect: 'reject',
        messageKey: 'unique',
        repeat: true,
        values: base,
        why: 'Gửi form hợp lệ hai lần: lần hai phải bị từ chối vì trùng.',
      });
    }

    if (f.compare) {
      const other = base[f.compare.field] ?? '';
      const bad = shifted(other, f.compare.op, false);
      const o = form.fields.find((x) => x.key === f.compare?.field);
      add({
        id: `${f.key}:compare.${f.compare.op}`,
        name: `${L}: không thỏa so sánh với ${o ? label(o) : f.compare.field}`,
        technique: 'equivalence',
        field: f.key,
        expect: 'reject',
        messageKey: `compare.${f.compare.op}`,
        messageParams: { other: o ? label(o) : f.compare.field },
        values: withValue(f.key, bad),
        why: `${L} phải ${f.compare.op} ${o ? label(o) : f.compare.field}; nhập "${bad}" với "${other}".`,
      });
    }

    if (f.type === 'file') {
      const exts = f.file?.extensions ?? [];
      if (exts.length) {
        add({
          id: `${f.key}:fileType`,
          name: `${L}: loại file không cho phép (.exe)`,
          technique: 'equivalence',
          field: f.key,
          expect: 'reject',
          messageKey: 'fileType',
          messageParams: { types: exts.join(', ') },
          values: withValue(f.key, 'virus.exe'),
          why: `Chỉ nhận ${exts.join(', ')}.`,
        });
      }
      if (f.file?.maxSizeKb) {
        add({
          id: `${f.key}:fileSize`,
          name: `${L}: file vượt dung lượng (${f.file.maxSizeKb + 1} KB)`,
          technique: 'boundary',
          field: f.key,
          expect: 'reject',
          messageKey: 'fileSize',
          messageParams: { size: f.file.maxSizeKb },
          values: withValue(f.key, `${base[f.key] ?? 'sample.pdf'}@${f.file.maxSizeKb + 1}KB`),
          why: `Tối đa ${f.file.maxSizeKb} KB.`,
        });
      }
    }
  }

  // Decision table for fields that depend on another one.
  for (const f of form.fields) {
    const L = label(f);
    if (f.requiredWhen) {
      const ctl = form.fields.find((x) => x.key === f.requiredWhen?.field);
      const on = { ...base, ...satisfy(f.requiredWhen, true, ctl, base), [f.key]: '' };
      const off = { ...base, ...satisfy(f.requiredWhen, false, ctl, base), [f.key]: '' };
      add({
        id: `${f.key}:requiredWhen.on`,
        name: `${L}: bắt buộc khi ${ctl ? label(ctl) : f.requiredWhen.field} thỏa điều kiện, để trống`,
        technique: 'decision',
        field: f.key,
        expect: 'reject',
        messageKey: 'required',
        values: on,
        why: 'Điều kiện đúng → ô này bắt buộc.',
      });
      add({
        id: `${f.key}:requiredWhen.off`,
        name: `${L}: không bắt buộc khi điều kiện không thỏa, để trống`,
        technique: 'decision',
        field: f.key,
        expect: 'accept',
        values: off,
        why: 'Điều kiện sai → ô này được bỏ trống.',
      });
    }
    if (f.visibleWhen) {
      const ctl = form.fields.find((x) => x.key === f.visibleWhen?.field);
      const hiddenValues = { ...base, ...satisfy(f.visibleWhen, false, ctl, base) };
      delete hiddenValues[f.key];
      add({
        id: `${f.key}:visibleWhen.off`,
        name: `${L}: ẩn khi điều kiện không thỏa`,
        technique: 'decision',
        field: f.key,
        expect: 'accept',
        values: hiddenValues,
        hidden: [f.key],
        why: 'Điều kiện sai → ô này không được hiện.',
        selected: true,
      });
    }
  }

  // Pairwise over the choice fields (dropdown, checkbox).
  const factors = form.fields
    .filter((f) => !f.readOnly && f.key in base)
    .flatMap((f) =>
      f.type === 'dropdown' && f.options.length > 1
        ? [{ key: f.key, values: f.options }]
        : f.type === 'checkbox'
          ? [{ key: f.key, values: ['true', 'false'] }]
          : [],
    );
  pairwise(factors).forEach((combo, i) => {
    add({
      id: `pairwise:${i + 1}`,
      name: `Tổ hợp ${i + 1}: ${Object.entries(combo)
        .map(
          ([k, v]) =>
            `${label(form.fields.find((x) => x.key === k) ?? ({ key: k, label: k } as FieldSpec))}=${v}`,
        )
        .join(', ')}`,
      technique: 'pairwise',
      expect: 'accept',
      values: { ...base, ...combo },
      why: 'Mọi cặp lựa chọn của hai ô đều được thử ít nhất một lần.',
      selected: false,
    });
  });

  return cases;
}

/** Values of the controller that switch a condition on (`on`) or off. */
function satisfy(
  c: FieldCondition,
  on: boolean,
  controller: FieldSpec | undefined,
  base: Record<string, string>,
): Record<string, string> {
  const other =
    controller?.type === 'dropdown'
      ? (controller.options.find((o) => o !== c.value) ?? 'khac')
      : 'khac';
  const filled = base[c.field] || 'abc';
  switch (c.op) {
    case 'equals':
      return { [c.field]: on ? (c.value ?? '') : other };
    case 'notEquals':
      return { [c.field]: on ? other : (c.value ?? '') };
    case 'filled':
      return { [c.field]: on ? filled : '' };
    case 'empty':
      return { [c.field]: on ? '' : filled };
  }
}

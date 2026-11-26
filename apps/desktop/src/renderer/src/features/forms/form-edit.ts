import { type FieldSpec, type FieldType, type FormSpec, FormSpecsSchema } from '@kiemi/schema';

/** Key suggested from a label: "Số điện thoại" → "so_dien_thoai", unique among `taken`. */
export function fieldKeyFrom(label: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  let base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
  if (!/^[a-z]/.test(base)) base = `f${base ? `_${base}` : ''}`.slice(0, 30);
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
  return key;
}

/** A new empty field of `type`, with a key not used by `form`. */
export function newField(form: FormSpec, type: FieldType = 'text'): FieldSpec {
  return {
    key: fieldKeyFrom(
      'truong',
      form.fields.map((f) => f.key),
    ),
    label: '',
    type,
    required: false,
    allowedChars: 'any',
    unique: false,
    badData: true,
    readOnly: false,
    options: [],
    ruleRefs: [],
  };
}

export function newForm(id: string, name = ''): FormSpec {
  return { id, name, fields: [] };
}

/** Number typed in a box: empty → unset. */
export const toNumber = (text: string): number | undefined => {
  const t = text.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** Drops keys that are `undefined`/empty so the stored form stays small. */
export function cleanField(f: FieldSpec): FieldSpec {
  const out: Record<string, unknown> = { ...f };
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === '') delete out[k];
  if (f.type !== 'dropdown') out.options = [];
  if (f.type !== 'file') delete out.file;
  return out as unknown as FieldSpec;
}

/** First problem of the forms in plain text, or null when they can be saved. */
export function firstFormProblem(forms: FormSpec[]): string | null {
  const r = FormSpecsSchema.safeParse(forms);
  if (r.success) return null;
  const issue = r.error.issues[0];
  if (!issue) return 'invalid';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Fields other than `key`, for the "depends on / compare with" lists. */
export const otherFields = (form: FormSpec, key: string): FieldSpec[] =>
  form.fields.filter((f) => f.key !== key);

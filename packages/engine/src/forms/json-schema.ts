import { type FieldSpec, type FormSpec, FormSpecSchema } from '@kiemi/schema';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined;
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Follows a local `$ref` such as `#/components/schemas/User`. */
function deref(root: Json, node: Json, depth = 0): Json {
  const ref = str(node.$ref);
  if (!ref?.startsWith('#/') || depth > 8) return node;
  let cur: unknown = root;
  for (const part of ref.slice(2).split('/'))
    cur = obj(cur)?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  const next = obj(cur);
  return next ? deref(root, next, depth + 1) : node;
}

function fieldOf(root: Json, key: string, raw: Json, required: boolean): FieldSpec {
  const s = deref(root, raw);
  const type = str(s.type);
  const format = str(s.format);
  const isNumber = type === 'number' || type === 'integer';
  const enumValues = Array.isArray(s.enum) ? s.enum.map(String) : [];
  let kind: FieldSpec['type'] = 'text';
  if (enumValues.length) kind = 'dropdown';
  else if (isNumber) kind = 'number';
  else if (type === 'boolean') kind = 'checkbox';
  else if (format === 'email') kind = 'email';
  else if (format === 'date' || format === 'date-time') kind = 'date';
  else if (format === 'password') kind = 'password';
  else if (format === 'binary') kind = 'file';
  const min = isNumber ? (num(s.minimum) ?? num(s.exclusiveMinimum)) : undefined;
  const max = isNumber ? (num(s.maximum) ?? num(s.exclusiveMaximum)) : undefined;
  const minLength = !isNumber ? num(s.minLength) : undefined;
  const maxLength = !isNumber ? num(s.maxLength) : undefined;
  const pattern = str(s.pattern);
  const def = s.default;
  return {
    key: key
      .replace(/[^A-Za-z0-9_]/g, '_')
      .replace(/^(?=[0-9])/, '_')
      .slice(0, 40),
    label: str(s.title) ?? key,
    type: kind,
    required,
    allowedChars: 'any',
    unique: false,
    badData: true,
    trim: true,
    readOnly: s.readOnly === true,
    options: enumValues,
    ruleRefs: [],
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(pattern === undefined ? {} : { pattern }),
    ...(def === undefined || typeof def === 'object' ? {} : { defaultValue: String(def) }),
  };
}

/**
 * JSON Schema (an object schema) or an OpenAPI document → form specs [R-02].
 * An OpenAPI document gives one form per request body of a POST/PUT/PATCH.
 */
export function formSpecsFromSchema(input: unknown, idPrefix = 'schema'): FormSpec[] {
  const root = obj(input);
  if (!root) return [];
  const forms: { name: string; schema: Json }[] = [];
  const paths = obj(root.paths);
  if (paths) {
    for (const [path, item] of Object.entries(paths)) {
      for (const method of ['post', 'put', 'patch']) {
        const op = obj(obj(item)?.[method]);
        const content = obj(obj(deref(root, obj(op?.requestBody) ?? {}))?.content);
        const body = obj(content?.['application/json'] ?? content?.['multipart/form-data']);
        const schema = obj(body?.schema);
        if (schema)
          forms.push({ name: str(op?.summary) ?? `${method.toUpperCase()} ${path}`, schema });
      }
    }
  } else {
    forms.push({ name: str(root.title) ?? 'Form', schema: root });
  }
  const out: FormSpec[] = [];
  forms.forEach(({ name, schema }, i) => {
    const s = deref(root, schema);
    const props = obj(s.properties);
    if (!props) return;
    const required = new Set(Array.isArray(s.required) ? s.required.map(String) : []);
    const fields = Object.entries(props).map(([key, v]) =>
      fieldOf(root, key, obj(v) ?? {}, required.has(key)),
    );
    const parsed = FormSpecSchema.safeParse({ id: `${idPrefix}-${i + 1}`, name, fields });
    if (parsed.success) out.push(parsed.data);
  });
  return out;
}

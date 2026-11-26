import { type Formulas, FormulasSchema } from '@kiemi/schema';

/** One editable row of the formulas screen. */
export interface FormulaRow {
  key: string;
  name: string;
  /** Inputs, comma separated. */
  params: string;
  expression: string;
  description: string;
}

let counter = 0;
export const newRow = (name = ''): FormulaRow => ({
  key: `f${++counter}`,
  name,
  params: '',
  expression: '',
  description: '',
});

export function toRows(formulas: Formulas): FormulaRow[] {
  return Object.entries(formulas).map(([name, f]) => ({
    ...newRow(name),
    params: f.params.join(', '),
    expression: f.expression,
    description: f.description ?? '',
  }));
}

export const splitParams = (text: string): string[] =>
  text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

/** Rows → stored formulas, or the first problem (for the Save button). */
export function fromRows(
  rows: FormulaRow[],
): { ok: true; formulas: Formulas } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const name = r.name.trim();
    if (!name && !r.expression.trim()) continue; // empty row
    if (!name) return { ok: false, error: 'name' };
    if (Object.hasOwn(out, name)) return { ok: false, error: `duplicate:${name}` };
    out[name] = {
      params: splitParams(r.params),
      expression: r.expression,
      ...(r.description.trim() ? { description: r.description.trim() } : {}),
    };
  }
  const p = FormulasSchema.safeParse(out);
  if (!p.success) {
    const issue = p.error.issues[0];
    return { ok: false, error: `${String(issue?.path.join('.') ?? '')}: ${issue?.message ?? ''}` };
  }
  return { ok: true, formulas: p.data };
}

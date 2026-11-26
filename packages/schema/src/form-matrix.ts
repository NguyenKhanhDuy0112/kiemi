import type { FieldSpec, FormSpec } from './form-spec';

/** Tag that ties a generated test to its form and case [R-09]. */
export const FORM_CASE_TAG = 'form-case:';
export const formCaseTag = (formId: string, caseId: string): string =>
  `${FORM_CASE_TAG}${formId}|${caseId}`;

export function parseFormCaseTag(
  tags: readonly string[],
): { formId: string; caseId: string } | null {
  const t = tags.find((x) => x.startsWith(FORM_CASE_TAG));
  if (!t) return null;
  const [formId, ...rest] = t.slice(FORM_CASE_TAG.length).split('|');
  const caseId = rest.join('|');
  return formId && caseId ? { formId, caseId } : null;
}

/** Result of one generated test, as the matrix needs it. */
export interface CaseOutcome {
  formId: string;
  caseId: string;
  passed: boolean;
  /** Names of the failed steps (the soft checks name what went wrong). */
  failedChecks: string[];
  /** Whatever lets the screen open the case (run case id). */
  ref: string;
}

export interface MatrixCell {
  status: 'pass' | 'fail' | 'none';
  cases: CaseOutcome[];
}

export interface MatrixRow {
  /** `null` for cases about the whole form (all valid, pairwise). */
  field: FieldSpec | null;
  cells: Record<string, MatrixCell>;
}

export interface FormMatrix {
  /** Rule keys in display order. */
  columns: string[];
  rows: MatrixRow[];
}

const RULE_ORDER = [
  'required',
  'minLength',
  'maxLength',
  'min',
  'max',
  'notNumber',
  'format',
  'pattern',
  'allowedChars',
  'unique',
  'compare',
  'fileType',
  'fileSize',
  'requiredWhen',
  'visibleWhen',
  'bad',
] as const;

/** The rule a case belongs to: `name:minLength.below` → `minLength`; `valid` → `valid`. */
export function ruleOfCase(caseId: string): string {
  if (caseId.startsWith('pairwise:')) return 'pairwise';
  const [, rest] = caseId.split(/:(.*)/s);
  if (rest === undefined) return caseId;
  return rest.split('.')[0] ?? rest;
}

/** The field a case is about (`name:required` → `name`), or null. */
export function fieldOfCase(caseId: string): string | null {
  return caseId.includes(':') && !caseId.startsWith('pairwise:')
    ? (caseId.split(':')[0] ?? null)
    : null;
}

/** Field × rule matrix of a form's results: pass / fail / not tested [R-09]. */
export function buildMatrix(form: FormSpec, outcomes: readonly CaseOutcome[]): FormMatrix {
  const mine = outcomes.filter((o) => o.formId === form.id);
  const present = new Set(mine.map((o) => ruleOfCase(o.caseId)));
  const ordered = RULE_ORDER.filter((r) => present.has(r));
  const extra = [...present].filter((r) => !(RULE_ORDER as readonly string[]).includes(r)).sort();
  const columns = [...ordered, ...extra];
  const rowFor = (key: string | null): MatrixRow => {
    const cells: Record<string, MatrixCell> = {};
    for (const col of columns) {
      const cases = mine.filter(
        (o) => fieldOfCase(o.caseId) === key && ruleOfCase(o.caseId) === col,
      );
      cells[col] = {
        status: cases.length === 0 ? 'none' : cases.every((c) => c.passed) ? 'pass' : 'fail',
        cases,
      };
    }
    return { field: key === null ? null : (form.fields.find((f) => f.key === key) ?? null), cells };
  };
  const rows = form.fields
    .filter((f) => mine.some((o) => fieldOfCase(o.caseId) === f.key))
    .map((f) => rowFor(f.key));
  if (mine.some((o) => fieldOfCase(o.caseId) === null)) rows.unshift(rowFor(null));
  return { columns, rows };
}

import { type CaseOutcome, type FormMatrix, parseFormCaseTag, type TestCase } from '@kiemi/schema';
import type { LiveCase } from './run-state';

/** Results of the generated form tests of a run, read from their tags and soft checks [R-09]. */
export function outcomesOf(
  cases: readonly LiveCase[],
  docs: Record<string, TestCase | undefined>,
): CaseOutcome[] {
  const out: CaseOutcome[] = [];
  for (const c of cases) {
    const doc = docs[c.testCaseId];
    const tag = doc ? parseFormCaseTag(doc.tags) : null;
    if (!tag || c.status === 'queued' || c.status === 'running') continue;
    const names = new Map((doc?.steps ?? []).map((s) => [s.id, s.name ?? s.id]));
    out.push({
      ...tag,
      passed: c.status === 'passed',
      failedChecks: Object.entries(c.steps)
        .filter(([, s]) => s.status === 'failed')
        .map(([id]) => names.get(id) ?? id),
      ref: c.runCaseId,
    });
  }
  return out;
}

/** The matrix as a table for Excel: one row per field, ✓ / ✗ / – per rule. */
export function matrixTable(
  m: FormMatrix,
  label: { field: string; wholeForm: string; rule: (key: string) => string },
): { columns: string[]; rows: Record<string, string>[] } {
  const columns = [label.field, ...m.columns.map(label.rule)];
  const mark = { pass: '✓', fail: '✗', none: '–' } as const;
  const rows = m.rows.map((r) => ({
    [label.field]: r.field?.label ?? label.wholeForm,
    ...Object.fromEntries(
      m.columns.map((c) => [label.rule(c), mark[r.cells[c]?.status ?? 'none']]),
    ),
  }));
  return { columns, rows };
}

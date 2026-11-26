import type { ReportSheet } from '@kiemi/db';
import { describeRunError } from '@kiemi/shared';
import { stepText } from '../editor/describe';
import { type ReportInput, walk } from './report';

const sec = (ms: number | undefined): number | string =>
  ms === undefined ? '' : Math.round(ms / 100) / 10;

const stamp = (d: Date): string =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * The run as two Excel sheets [X-01]: "Tổng hợp" (totals, per test, one line per test × data row)
 * and "Chi tiết" (one line per step with the expected value next to the actual one).
 */
export function buildReportSheets(input: ReportInput): ReportSheet[] {
  const { run, tx } = input;
  const label = (status: string) => tx(`ui.run.status.${status}`);
  const count = (s: string) => run.cases.filter((c) => c.status === s).length;

  const byTest = new Map<string, { name: string; runs: number; passed: number; failed: number }>();
  for (const c of run.cases) {
    const t = byTest.get(c.testCaseId) ?? { name: c.testName, runs: 0, passed: 0, failed: 0 };
    t.runs++;
    if (c.status === 'passed') t.passed++;
    else if (c.status === 'failed' || c.status === 'error') t.failed++;
    byTest.set(c.testCaseId, t);
  }

  const summary: ReportSheet = {
    name: tx('ui.report.xlsx.summary'),
    intro: [
      [`${tx('ui.report.title')} — ${input.title}`],
      [tx('ui.report.xlsx.result'), label(run.status)],
      [tx('ui.report.xlsx.environment'), input.environmentName ?? ''],
      [tx('ui.report.started'), input.startedAt ? stamp(input.startedAt) : ''],
      [tx('ui.report.xlsx.duration'), sec(run.durationMs)],
      [
        tx('ui.report.xlsx.totals'),
        tx('ui.run.summary', { passed: count('passed'), total: run.cases.length }),
      ],
      [tx('ui.report.xlsx.perTest')],
      ...[...byTest.values()].map((t) => [
        t.name,
        tx('ui.report.xlsx.perTestLine', { runs: t.runs, passed: t.passed, failed: t.failed }),
      ]),
    ],
    columns: [
      tx('ui.report.xlsx.test'),
      tx('ui.report.xlsx.dataRow'),
      tx('ui.report.xlsx.result'),
      tx('ui.report.xlsx.seconds'),
      tx('ui.report.xlsx.error'),
    ],
    rows: run.cases.map((c) => {
      const firstError = c.error ?? Object.values(c.steps).find((s) => s.error)?.error;
      return [
        c.testName,
        c.rowIndex === undefined ? '' : c.rowIndex + 1,
        label(c.status),
        sec(c.durationMs),
        firstError ? describeRunError(firstError, tx).message : '',
      ];
    }),
  };

  const detailRows: (string | number)[][] = [];
  for (const c of run.cases) {
    const doc = input.tests[c.testCaseId];
    const entries = doc
      ? [...walk(doc.steps, '', 0), ...walk(doc.cleanup, 'C', 0)]
      : Object.entries(c.steps).map(([id, s]) => ({
          step: { id } as never,
          no: s.stepNo,
          depth: 0,
        }));
    for (const { step, no } of entries) {
      const r = c.steps[(step as { id: string }).id];
      const d = r?.error?.details as { expected?: unknown; actual?: unknown } | undefined;
      detailRows.push([
        c.testName,
        c.rowIndex === undefined ? '' : c.rowIndex + 1,
        no,
        doc ? stepText(step, doc.elements, tx, input.sharedNames) : '',
        label(r?.status ?? 'skipped'),
        sec(r?.durationMs),
        d?.expected === undefined ? '' : String(d.expected),
        d?.actual === undefined ? '' : String(d.actual),
        r?.error ? describeRunError(r.error, tx).message : '',
      ]);
    }
  }
  const detail: ReportSheet = {
    name: tx('ui.report.xlsx.detail'),
    columns: [
      tx('ui.report.xlsx.test'),
      tx('ui.report.xlsx.dataRow'),
      tx('ui.report.xlsx.step'),
      tx('ui.report.xlsx.stepText'),
      tx('ui.report.xlsx.result'),
      tx('ui.report.xlsx.seconds'),
      tx('ui.report.xlsx.expected'),
      tx('ui.report.xlsx.actual'),
      tx('ui.report.xlsx.error'),
    ],
    rows: detailRows,
  };
  return [summary, detail];
}

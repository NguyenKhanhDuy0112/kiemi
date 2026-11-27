import { compareObservations, type ObservationDiff } from '@kiemi/schema';
import type { LiveCase, LiveCaseStatus, LiveRun, LiveStepStatus } from '../run/run-state';

export interface CompareStep {
  stepId: string;
  stepNo: string;
  a?: LiveStepStatus | undefined;
  b?: LiveStepStatus | undefined;
  changed: boolean;
}

export interface CompareCase {
  key: string;
  testCaseId: string;
  testName: string;
  rowIndex?: number | undefined;
  a?: LiveCaseStatus | undefined;
  b?: LiveCaseStatus | undefined;
  changed: boolean;
  steps: CompareStep[];
  /** Noted values that differ between the two runs (UAT vs Staging) [V-06]. */
  fields: ObservationDiff[];
}

const caseKey = (c: LiveCase) => `${c.testCaseId}#${c.rowIndex ?? ''}`;

/** Natural order of step numbers: 2 < 10, 3 < 3.1 < 4. */
function byStepNo(x: string, y: string): number {
  const px = x.split('.').map(Number);
  const py = y.split('.').map(Number);
  for (let i = 0; i < Math.max(px.length, py.length); i++) {
    const d = (px[i] ?? -1) - (py[i] ?? -1);
    if (d !== 0 && !Number.isNaN(d)) return d;
  }
  return x.localeCompare(y);
}

/** Side by side results of two runs, case by case and step by step [S-05]. */
export function compareRuns(a: LiveRun, b: LiveRun): CompareCase[] {
  const keys: string[] = [];
  const ca = new Map(a.cases.map((c) => [caseKey(c), c]));
  const cb = new Map(b.cases.map((c) => [caseKey(c), c]));
  for (const c of [...a.cases, ...b.cases]) if (!keys.includes(caseKey(c))) keys.push(caseKey(c));
  return keys.map((key) => {
    const x = ca.get(key);
    const y = cb.get(key);
    const base = (x ?? y) as LiveCase;
    const ids = new Set([...Object.keys(x?.steps ?? {}), ...Object.keys(y?.steps ?? {})]);
    const steps = [...ids]
      .map((stepId) => {
        const sa = x?.steps[stepId];
        const sb = y?.steps[stepId];
        return {
          stepId,
          stepNo: (sa ?? sb)?.stepNo ?? '',
          a: sa?.status,
          b: sb?.status,
          changed: sa?.status !== sb?.status,
        };
      })
      .sort((p, q) => byStepNo(p.stepNo, q.stepNo));
    const fields = compareObservations(x?.observations ?? {}, y?.observations ?? {}).filter(
      (f) => f.status !== 'same',
    );
    return {
      key,
      testCaseId: base.testCaseId,
      testName: base.testName,
      rowIndex: base.rowIndex,
      a: x?.status,
      b: y?.status,
      changed: x?.status !== y?.status || steps.some((s) => s.changed) || fields.length > 0,
      steps,
      fields,
    };
  });
}

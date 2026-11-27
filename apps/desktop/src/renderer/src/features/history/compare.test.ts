import { describe, expect, it } from 'vitest';
import type { LiveCase, LiveRun } from '../run/run-state';
import { compareRuns } from './compare';

const kase = (
  status: LiveCase['status'],
  steps: Record<string, [string, LiveCase['status']]>,
): LiveCase => ({
  runCaseId: 'c',
  testCaseId: 't1',
  testName: 'Đăng nhập',
  status,
  stepCount: 0,
  stepsDone: 0,
  artifacts: [],
  steps: Object.fromEntries(
    Object.entries(steps).map(([id, [no, st]]) => [
      id,
      { stepNo: no, status: st as 'passed', artifacts: [] },
    ]),
  ),
});
const run = (cases: LiveCase[]): LiveRun => ({
  runId: 'r',
  status: 'passed',
  cases,
  stopping: false,
});

describe('compare two runs [S-05]', () => {
  it('lines up cases and steps and flags differences', () => {
    const a = run([
      kase('passed', { s1: ['1', 'passed'], s10: ['10', 'passed'], s2: ['2', 'passed'] }),
    ]);
    const b = run([
      kase('failed', { s1: ['1', 'passed'], s2: ['2', 'failed'] }),
      { ...kase('passed', {}), testCaseId: 't2', testName: 'Mới' },
    ]);
    const r = compareRuns(a, b);
    expect(r.map((c) => [c.testName, c.a, c.b, c.changed])).toEqual([
      ['Đăng nhập', 'passed', 'failed', true],
      ['Mới', undefined, 'passed', true],
    ]);
    expect(r[0]?.steps.map((s) => [s.stepNo, s.a, s.b, s.changed])).toEqual([
      ['1', 'passed', 'passed', false],
      ['2', 'passed', 'failed', true],
      ['10', 'passed', undefined, true],
    ]);
  });
});

describe('compare noted values of two runs [V-06]', () => {
  it('reports exactly the field that differs, even when every step passed', () => {
    const uat = {
      ...kase('passed', { s1: ['1', 'passed'] }),
      observations: { gia: '100', ten: 'An' },
    };
    const staging = {
      ...kase('passed', { s1: ['1', 'passed'] }),
      observations: { gia: '120', ten: 'An' },
    };
    const [c] = compareRuns(run([uat]), run([staging]));
    expect(c?.changed).toBe(true);
    expect(c?.fields).toEqual([{ name: 'gia', a: '100', b: '120', status: 'different' }]);
  });
});

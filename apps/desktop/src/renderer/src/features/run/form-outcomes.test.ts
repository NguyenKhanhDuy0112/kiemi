import { buildMatrix, FormSpecSchema, formCaseTag, type TestCase } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { matrixTable, outcomesOf } from './form-outcomes';
import type { LiveCase } from './run-state';

const doc = (caseId: string): TestCase =>
  ({
    tags: ['x', formCaseTag('reg', caseId)],
    steps: [
      { id: 's1', name: 'Gửi form' },
      { id: 'chk-message', name: 'Thông báo lỗi của "Họ tên"' },
    ],
  }) as unknown as TestCase;

const live = (id: string, status: LiveCase['status'], failed: string[] = []): LiveCase =>
  ({
    runCaseId: `rc-${id}`,
    testCaseId: `t-${id}`,
    testName: id,
    status,
    stepCount: 2,
    stepsDone: 2,
    artifacts: [],
    steps: Object.fromEntries(
      ['s1', 'chk-message'].map((s) => [
        s,
        { status: failed.includes(s) ? 'failed' : 'passed', stepNo: '1', artifacts: [] },
      ]),
    ),
  }) as LiveCase;

describe('form outcomes [R-09]', () => {
  const form = FormSpecSchema.parse({
    id: 'reg',
    name: 'Đăng ký',
    fields: [{ key: 'name', label: 'Họ tên', required: true }],
  });

  it('reads the generated tests of a run and names the failed checks', () => {
    const out = outcomesOf(
      [live('a', 'passed'), live('b', 'failed', ['chk-message']), live('c', 'running')],
      { 't-a': doc('name:required'), 't-b': doc('valid'), 't-c': doc('name:required') },
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({
      caseId: 'valid',
      passed: false,
      failedChecks: ['Thông báo lỗi của "Họ tên"'],
      ref: 'rc-b',
    });
  });

  it('ignores tests that are not generated from a form', () => {
    expect(
      outcomesOf([live('a', 'passed')], { 't-a': { tags: ['x'], steps: [] } as never }),
    ).toEqual([]);
  });

  it('turns the matrix into rows of ✓ ✗ –', () => {
    const m = buildMatrix(form, [
      { formId: 'reg', caseId: 'name:required', passed: false, failedChecks: [], ref: 'r' },
      { formId: 'reg', caseId: 'valid', passed: true, failedChecks: [], ref: 'r2' },
    ]);
    const t = matrixTable(m, { field: 'Ô nhập', wholeForm: 'Cả form', rule: (k) => k });
    expect(t.columns).toEqual(['Ô nhập', 'required', 'valid']);
    expect(t.rows).toEqual([
      { 'Ô nhập': 'Cả form', required: '–', valid: '✓' },
      { 'Ô nhập': 'Họ tên', required: '✗', valid: '–' },
    ]);
  });
});

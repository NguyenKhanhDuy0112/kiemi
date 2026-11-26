import { describe, expect, it } from 'vitest';
import { generateFormCases } from './form-cases';
import {
  buildMatrix,
  type CaseOutcome,
  fieldOfCase,
  formCaseTag,
  parseFormCaseTag,
  ruleOfCase,
} from './form-matrix';
import { FormSpecSchema } from './form-spec';

const form = FormSpecSchema.parse({
  id: 'reg',
  name: 'Đăng ký',
  fields: [
    { key: 'name', label: 'Họ tên', required: true, minLength: 2, maxLength: 50 },
    { key: 'phone', label: 'SĐT', type: 'phone', ruleRefs: ['vn-phone'] },
  ],
});

describe('form matrix [R-09]', () => {
  it('reads the field and rule of a case id', () => {
    expect(ruleOfCase('name:minLength.below')).toBe('minLength');
    expect(ruleOfCase('phone:format.vn-phone.2')).toBe('format');
    expect(ruleOfCase('name:bad.script-tag')).toBe('bad');
    expect(ruleOfCase('valid')).toBe('valid');
    expect(ruleOfCase('pairwise:3')).toBe('pairwise');
    expect(fieldOfCase('name:required')).toBe('name');
    expect(fieldOfCase('valid')).toBeNull();
    expect(fieldOfCase('pairwise:1')).toBeNull();
  });

  it('round-trips the tag', () => {
    expect(parseFormCaseTag(['x', formCaseTag('reg', 'name:required')])).toEqual({
      formId: 'reg',
      caseId: 'name:required',
    });
    expect(parseFormCaseTag(['x'])).toBeNull();
  });

  it('builds a field × rule grid with pass, fail and untested cells', () => {
    const outcomes: CaseOutcome[] = generateFormCases(form)
      .filter((c) => c.selected)
      .map((c, i) => ({
        formId: 'reg',
        caseId: c.id,
        passed: c.id !== 'name:maxLength.above' && c.id !== 'name:maxLength.at',
        failedChecks: c.id === 'name:maxLength.above' ? ['Thông báo lỗi của "Họ tên"'] : [],
        ref: `r${i}`,
      }));
    const m = buildMatrix(form, outcomes);
    expect(m.columns.slice(0, 3)).toEqual(['required', 'minLength', 'maxLength']);
    expect(m.rows[0]?.field).toBeNull();
    const name = m.rows.find((r) => r.field?.key === 'name');
    expect(name?.cells.required?.status).toBe('pass');
    expect(name?.cells.maxLength?.status).toBe('fail');
    expect(name?.cells.maxLength?.cases.map((c) => c.caseId)).toContain('name:maxLength.above');
    const phone = m.rows.find((r) => r.field?.key === 'phone');
    expect(phone?.cells.required?.status).toBe('none');
    expect(phone?.cells.format?.status).toBe('pass');
  });
});

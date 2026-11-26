import { generateFormCases } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { readExcel, writeExcel } from './io/excel';
import { FIELD_SPEC_TEMPLATE, formFromTable } from './io/field-spec-excel';

describe('field spec from Excel [R-14]', () => {
  it('reads the template into the declared form', async () => {
    const table = await readExcel(await writeExcel(FIELD_SPEC_TEMPLATE));
    const { form, warnings } = formFromTable(table, 'Đăng ký', 'f1');
    expect(warnings).toEqual([]);
    const by = Object.fromEntries(form.fields.map((f) => [f.key, f]));
    expect(Object.keys(by)).toEqual(['ho_ten', 'email', 'so_dien_thoai', 'mat_khau', 'tuoi']);
    expect(by.ho_ten).toMatchObject({ type: 'text', required: true, minLength: 2, maxLength: 50 });
    expect(by.email).toMatchObject({ type: 'email', required: true, unique: true, maxLength: 100 });
    expect(by.so_dien_thoai).toMatchObject({
      type: 'phone',
      required: false,
      ruleRefs: ['vn-phone'],
    });
    expect(by.mat_khau).toMatchObject({ ruleRefs: ['strong-password'], maxLength: 32 });
    expect(by.tuoi).toMatchObject({ type: 'number', min: 18, max: 99 });
  });

  it('gives the same cases as the same form declared by hand', () => {
    const { form } = formFromTable(FIELD_SPEC_TEMPLATE, 'X', 'x');
    const ids = generateFormCases(form).map((c) => c.id);
    expect(ids).toContain('ho_ten:minLength.below');
    expect(ids).toContain('tuoi:max.above');
    expect(ids).toContain('so_dien_thoai:format.vn-phone.1');
  });

  it('accepts English headers, patterns, and reports what it ignores', () => {
    const { form, warnings } = formFromTable(
      {
        columns: ['Field', 'Type', 'Required', 'Min', 'Max', 'Format', 'Error message'],
        rows: [
          {
            Field: 'Code',
            Type: 'Text',
            Required: 'yes',
            Min: '',
            Max: '6',
            Format: '[A-Z]{3}',
            'Error message': 'Sai mã',
          },
          {
            Field: 'Weird',
            Type: 'Hologram',
            Required: '',
            Min: 'abc',
            Max: '',
            Format: '',
            'Error message': '',
          },
          {
            Field: 'Bad',
            Type: 'Text',
            Required: '',
            Min: '9',
            Max: '1',
            Format: '',
            'Error message': '',
          },
        ],
      },
      'En',
      'e',
    );
    expect(form.fields.map((f) => f.key)).toEqual(['code', 'weird']);
    expect(form.fields[0]).toMatchObject({ required: true, maxLength: 6, pattern: '[A-Z]{3}' });
    expect(warnings.some((w) => w.includes('Hologram'))).toBe(true);
    expect(warnings.some((w) => w.includes('Thông báo lỗi'))).toBe(true);
    expect(warnings.some((w) => w.includes('"abc"'))).toBe(true);
    expect(warnings.some((w) => w.includes('"Bad"'))).toBe(true);
  });
});

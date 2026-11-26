import { describe, expect, it } from 'vitest';
import { FormSpecSchema } from './form-spec';

const form = (fields: unknown[]) => FormSpecSchema.safeParse({ id: 'f1', name: 'Đăng ký', fields });

describe('FormSpec [R-01]', () => {
  it('declares a 5-field registration form with dependencies and comparisons', () => {
    const r = form([
      { key: 'email', label: 'Email', type: 'email', required: true, unique: true },
      { key: 'phone', label: 'SĐT', type: 'phone', ruleRefs: ['vn-phone'] },
      { key: 'password', label: 'Mật khẩu', type: 'password', required: true, minLength: 8 },
      {
        key: 'confirm',
        label: 'Xác nhận',
        type: 'password',
        compare: { field: 'password', op: 'eq' },
      },
      {
        key: 'company',
        label: 'Công ty',
        requiredWhen: { field: 'phone', op: 'filled' },
        visibleWhen: { field: 'email', op: 'notEquals', value: '' },
      },
    ]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fields[0]).toMatchObject({ type: 'email', allowedChars: 'any' });
  });

  it('rejects duplicate keys, unknown references and impossible ranges', () => {
    expect(
      form([
        { key: 'a', label: 'A' },
        { key: 'a', label: 'B' },
      ]).success,
    ).toBe(false);
    expect(form([{ key: 'a', label: 'A', compare: { field: 'zzz', op: 'gte' } }]).success).toBe(
      false,
    );
    expect(form([{ key: 'a', label: 'A', compare: { field: 'a', op: 'gte' } }]).success).toBe(
      false,
    );
    expect(form([{ key: 'a', label: 'A', minLength: 5, maxLength: 2 }]).success).toBe(false);
    expect(form([{ key: 'a', label: 'A', type: 'number', min: 9, max: 1 }]).success).toBe(false);
    expect(form([{ key: 'a', label: 'A', pattern: '(' }]).success).toBe(false);
    expect(form([{ key: 'a', label: 'A', type: 'dropdown' }]).success).toBe(false);
    expect(form([{ key: '1a', label: 'A' }]).success).toBe(false);
  });
});

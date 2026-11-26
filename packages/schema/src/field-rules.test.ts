import { describe, expect, it } from 'vitest';
import {
  BUILTIN_RULES,
  effectiveRules,
  expectedMessage,
  formatMessage,
  matchesRule,
  messageTemplate,
  rulesFor,
} from './field-rules';
import { FieldSpecSchema } from './form-spec';

describe('rule library [R-10]', () => {
  for (const rule of BUILTIN_RULES) {
    it(`${rule.id}: accepts its valid examples and rejects every bad one`, () => {
      expect(rule.valid.length).toBeGreaterThan(0);
      expect(rule.invalid.length).toBeGreaterThan(0);
      for (const v of rule.valid) expect(matchesRule(rule, v), `valid "${v}"`).toBe(true);
      for (const b of rule.invalid) {
        expect(matchesRule(rule, b.value), `invalid "${b.value}" (${b.why})`).toBe(false);
        expect(b.why.length).toBeGreaterThan(3);
      }
    });
  }

  it('offers rules by field type', () => {
    expect(rulesFor('phone').map((r) => r.id)).toContain('vn-phone');
    expect(rulesFor('money').map((r) => r.id)).toEqual(['vnd-money']);
  });

  it('applies attached rules; the field own settings win', () => {
    const phone = FieldSpecSchema.parse({
      key: 'p',
      label: 'SĐT',
      type: 'phone',
      ruleRefs: ['vn-phone'],
    });
    expect(effectiveRules(phone)).toMatchObject({
      minLength: 10,
      maxLength: 10,
      allowedChars: 'digits',
      patterns: ['0[0-9]{9}'],
    });
    const own = FieldSpecSchema.parse({
      key: 'p',
      label: 'SĐT',
      type: 'phone',
      ruleRefs: ['vn-phone'],
      maxLength: 11,
      pattern: '0.*',
    });
    expect(effectiveRules(own)).toMatchObject({ maxLength: 11, patterns: ['0.*', '0[0-9]{9}'] });
  });
});

describe('message catalog [R-10]', () => {
  it('fills placeholders and lets a project override a message', () => {
    expect(formatMessage('{field} từ {min}', { field: 'Tuổi', min: 18 })).toBe('Tuổi từ 18');
    expect(formatMessage('{x}', {})).toBe('{x}');
    expect(expectedMessage('minLength', { label: 'Mật khẩu' }, { min: 8 })).toBe(
      'Mật khẩu phải có ít nhất 8 ký tự',
    );
    expect(
      expectedMessage('required', { label: 'Email' }, {}, { required: 'Vui lòng nhập {field}' }),
    ).toBe('Vui lòng nhập Email');
    expect(messageTemplate('format.unknown-rule')).toContain('{field}');
  });
});

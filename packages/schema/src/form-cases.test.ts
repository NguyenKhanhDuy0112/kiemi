import { describe, expect, it } from 'vitest';
import { matchesRule, ruleById } from './field-rules';
import { generateFormCases, pairwise, validValues } from './form-cases';
import { FormSpecSchema } from './form-spec';
import { caseSteps, expectedError } from './form-steps';

/** The 5-field registration form of SPEC R.1. */
const form = FormSpecSchema.parse({
  id: 'reg',
  name: 'Đăng ký',
  fields: [
    {
      key: 'name',
      label: 'Họ tên',
      required: true,
      minLength: 2,
      maxLength: 50,
      ruleRefs: [],
    },
    { key: 'email', label: 'Email', type: 'email', required: true, maxLength: 100, unique: true },
    { key: 'phone', label: 'SĐT', type: 'phone', ruleRefs: ['vn-phone'] },
    {
      key: 'password',
      label: 'Mật khẩu',
      type: 'password',
      required: true,
      ruleRefs: ['strong-password'],
      maxLength: 32,
    },
    {
      key: 'confirm',
      label: 'Xác nhận mật khẩu',
      type: 'password',
      required: true,
      compare: { field: 'password', op: 'eq' },
    },
  ],
});

describe('generateFormCases [R-03]', () => {
  const cases = generateFormCases(form);
  const ids = cases.map((c) => c.id);

  it('starts with the all-valid case and keeps ids unique', () => {
    expect(cases[0]).toMatchObject({ id: 'valid', expect: 'accept', selected: true });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the valid values satisfy the rules and the comparison', () => {
    const v = validValues(form);
    expect(matchesRule(ruleById('vn-phone') as never, v.phone ?? '')).toBe(true);
    expect(v.confirm).toBe(v.password);
  });

  it('breaks exactly one field per case', () => {
    const valid = cases[0]?.values ?? {};
    for (const c of cases) {
      if (!c.field || c.repeat || c.hidden) continue;
      const changed = Object.keys(c.values).filter((k) => c.values[k] !== valid[k]);
      expect(changed, c.id).toEqual([c.field]);
    }
  });

  it('gives the name field its boundary values', () => {
    const name = (id: string) => cases.find((c) => c.id === `name:${id}`);
    expect(name('required')).toMatchObject({
      expect: 'reject',
      messageKey: 'required',
      values: { name: '' },
    });
    expect(name('minLength.below')).toMatchObject({ expect: 'reject', values: { name: 'a' } });
    expect(name('minLength.at')?.values.name).toHaveLength(2);
    expect(name('minLength.above')?.values.name).toHaveLength(3);
    expect(name('maxLength.below')?.values.name).toHaveLength(49);
    expect(name('maxLength.at')?.values.name).toHaveLength(50);
    expect(name('maxLength.above')).toMatchObject({ expect: 'reject', messageKey: 'maxLength' });
    expect(name('maxLength.above')?.values.name).toHaveLength(51);
  });

  it('adds format cases from the attached and implicit rules, unique and compare cases', () => {
    expect(ids).toContain('email:format.email.1');
    expect(ids).toContain('phone:format.vn-phone.1');
    expect(ids).toContain('password:format.strong-password.1');
    expect(cases.find((c) => c.id === 'email:unique')).toMatchObject({
      repeat: true,
      expect: 'reject',
    });
    expect(cases.find((c) => c.id === 'confirm:compare.eq')).toMatchObject({
      expect: 'reject',
      messageKey: 'compare.eq',
    });
    // Optional field: no "required" case.
    expect(ids).not.toContain('phone:required');
    // Every reject case names the message it expects.
    for (const c of cases.filter((x) => x.expect === 'reject'))
      expect(c.messageKey, c.id).toBeTruthy();
  });

  it('size is in the expected range for a 5-field form', () => {
    // Ticked by default: the all-valid case + one per broken rule; bad data is on top, unticked.
    const ticked = cases.filter((c) => c.selected).length;
    expect(ticked).toBeGreaterThanOrEqual(10);
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(ticked).toBeLessThanOrEqual(55);
    expect(cases.length).toBeLessThanOrEqual(90);
  });
});

describe('numbers, dependencies and choices', () => {
  const f = FormSpecSchema.parse({
    id: 'x',
    name: 'X',
    fields: [
      { key: 'age', label: 'Tuổi', type: 'number', required: true, min: 18, max: 99 },
      { key: 'kind', label: 'Loại', type: 'dropdown', options: ['ca-nhan', 'cong-ty'] },
      {
        key: 'tax',
        label: 'MST',
        requiredWhen: { field: 'kind', op: 'equals', value: 'cong-ty' },
        ruleRefs: ['vn-tax-code'],
      },
      { key: 'news', label: 'Nhận tin', type: 'checkbox' },
      { key: 'plan', label: 'Gói', type: 'dropdown', options: ['a', 'b', 'c'] },
    ],
  });
  const cases = generateFormCases(f);
  const by = (id: string) => cases.find((c) => c.id === id);

  it('covers the six boundary values of a number', () => {
    expect(by('age:min.below')?.values.age).toBe('17');
    expect(by('age:min.at')?.values.age).toBe('18');
    expect(by('age:min.above')?.values.age).toBe('19');
    expect(by('age:max.below')?.values.age).toBe('98');
    expect(by('age:max.at')?.values.age).toBe('99');
    expect(by('age:max.above')?.values.age).toBe('100');
  });

  it('makes a decision table for requiredWhen', () => {
    expect(by('tax:requiredWhen.on')).toMatchObject({
      expect: 'reject',
      values: { kind: 'cong-ty', tax: '' },
    });
    expect(by('tax:requiredWhen.off')).toMatchObject({ expect: 'accept' });
    expect(by('tax:requiredWhen.off')?.values.kind).toBe('ca-nhan');
  });

  it('adds pairwise cases, unticked by default', () => {
    const pw = cases.filter((c) => c.technique === 'pairwise');
    expect(pw.length).toBeGreaterThanOrEqual(6);
    expect(pw.every((c) => !c.selected)).toBe(true);
  });
});

describe('pairwise', () => {
  it('covers every pair of values', () => {
    const factors = [
      { key: 'a', values: ['1', '2', '3'] },
      { key: 'b', values: ['x', 'y'] },
      { key: 'c', values: ['p', 'q'] },
    ];
    const rows = pairwise(factors);
    const seen = new Set(
      rows.flatMap((r) => [`a${r.a}b${r.b}`, `a${r.a}c${r.c}`, `b${r.b}c${r.c}`]),
    );
    for (const a of factors[0]?.values ?? [])
      for (const b of ['x', 'y']) expect(seen.has(`a${a}b${b}`)).toBe(true);
    for (const a of factors[0]?.values ?? [])
      for (const c of ['p', 'q']) expect(seen.has(`a${a}c${c}`)).toBe(true);
    for (const b of ['x', 'y'])
      for (const c of ['p', 'q']) expect(seen.has(`b${b}c${c}`)).toBe(true);
    expect(rows.length).toBeLessThan(12);
    expect(pairwise([{ key: 'a', values: ['1', '2'] }])).toEqual([]);
  });
});

describe('caseSteps [R-03]', () => {
  it('types the values and sends the form', () => {
    const f = FormSpecSchema.parse({
      id: 'f',
      name: 'Đăng ký',
      path: '/dang-ky',
      submit: { strategies: [{ kind: 'role', role: 'button', name: 'Gửi' }] },
      fields: [
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'plan', label: 'Gói', type: 'dropdown', options: ['a', 'b'] },
        { key: 'ok', label: 'Đồng ý', type: 'checkbox' },
      ],
    });
    const c = generateFormCases(f).find((x) => x.id === 'valid');
    expect(c).toBeDefined();
    const steps = caseSteps(f, c as never);
    expect(steps.map((s) => s.action)).toEqual(['goto', 'fill', 'select', 'check', 'click']);
    expect(steps[0]?.params?.url).toBe('{{app}}/dang-ky');
    expect(steps[1]?.params?.target).toEqual({ strategies: [{ kind: 'label', value: 'Email' }] });
  });

  it('names the error a reject case expects, with the project wording', () => {
    const c = generateFormCases(form).find((x) => x.id === 'name:required');
    expect(expectedError(form, c as never)).toBe('Họ tên là bắt buộc');
    expect(expectedError(form, c as never, { required: 'Vui lòng nhập {field}' })).toBe(
      'Vui lòng nhập Họ tên',
    );
    expect(expectedError(form, generateFormCases(form)[0] as never)).toBeUndefined();
  });
});

describe('bad data cases [R-04]', () => {
  const cases = generateFormCases(form);
  const by = (id: string) => cases.find((c) => c.id === id);

  it('lists the standard bad values per field, unticked, each with a Vietnamese label', () => {
    const bad = cases.filter((c) => c.technique === 'badData');
    expect(bad.length).toBeGreaterThan(10);
    expect(bad.every((c) => !c.selected && c.name.length > 8 && c.why.length > 8)).toBe(true);
    expect(by('name:bad.whitespace-only')).toMatchObject({
      expect: 'reject',
      messageKey: 'required',
      values: { name: '   ' },
    });
    expect(by('name:bad.script-tag')).toMatchObject({ expect: 'safe' });
    expect(by('name:bad.very-long')).toMatchObject({ expect: 'reject', messageKey: 'maxLength' });
    expect(by('name:bad.vietnamese-nfd')?.values.name).not.toBe(
      by('name:bad.vietnamese-nfc')?.values.name,
    );
    expect(by('name:bad.vietnamese-nfd')?.values.name?.normalize('NFC')).toBe('Nguyễn Thị Ánh');
    // Not required: spaces only is just survived.
    expect(by('phone:bad.whitespace-only')).toMatchObject({ expect: 'safe' });
  });

  it('can be switched off per field, and fits dates and numbers', () => {
    const f = FormSpecSchema.parse({
      id: 'x',
      name: 'X',
      fields: [
        { key: 'a', label: 'A', badData: false },
        { key: 'd', label: 'Ngày', type: 'date' },
        { key: 'n', label: 'Số', type: 'number', min: 1 },
      ],
    });
    const ids = generateFormCases(f).map((c) => c.id);
    expect(ids.some((i) => i.startsWith('a:bad.'))).toBe(false);
    expect(ids).toContain('d:bad.date-31-feb');
    expect(ids).toContain('n:bad.scientific');
    expect(ids).not.toContain('d:bad.script-tag');
    expect(generateFormCases(f).find((c) => c.id === 'n:bad.negative-number')).toMatchObject({
      expect: 'reject',
      messageKey: 'min',
    });
  });
});

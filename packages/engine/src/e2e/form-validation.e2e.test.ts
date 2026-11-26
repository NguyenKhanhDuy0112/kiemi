import {
  caseSteps,
  type FormCase,
  type FormSpec,
  FormSpecSchema,
  generateFormCases,
} from '@kiemi/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2E, startE2E } from './helpers';

/**
 * M11-06 [R-05, R-07]: the generated checks tell a correct form from one with
 * deliberate bugs (wrong text, error next to another field, data cleared…).
 */
let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

const label = (value: string) => ({ strategies: [{ kind: 'css' as const, value }] });
const spec = (bug = ''): FormSpec =>
  FormSpecSchema.parse({
    id: 'reg',
    name: 'Đăng ký',
    path: `/register.html${bug ? `?bug=${bug}` : ''}`,
    submit: { strategies: [{ kind: 'role', role: 'button', name: 'Đăng ký' }] },
    successMessage: 'Đăng ký thành công',
    fields: [
      {
        key: 'fullname',
        label: 'Họ tên',
        locator: label('#fullname'),
        required: true,
        minLength: 2,
        maxLength: 50,
        readBack: label('#saved-fullname'),
      },
      {
        key: 'email',
        label: 'Email',
        type: 'email',
        locator: label('#email'),
        required: true,
        maxLength: 100,
        unique: true,
        readBack: label('#saved-email'),
      },
      {
        key: 'phone',
        label: 'Số điện thoại',
        type: 'phone',
        locator: label('#phone'),
        ruleRefs: ['vn-phone'],
        readBack: label('#saved-phone'),
      },
      {
        key: 'dob',
        label: 'Ngày sinh',
        locator: label('#dob'),
        required: true,
        example: '15/06/1990',
        badData: false,
      },
      {
        key: 'password',
        label: 'Mật khẩu',
        type: 'password',
        locator: label('#password'),
        required: true,
        ruleRefs: ['strong-password'],
        maxLength: 32,
      },
    ],
  });

const wanted = (c: FormCase) =>
  !c.repeat &&
  (c.selected ||
    [
      'fullname:bad.whitespace-edges',
      'fullname:bad.vietnamese-nfc',
      'fullname:bad.vietnamese-nfd',
    ].includes(c.id)) &&
  c.technique !== 'pairwise';

/** Runs the ticked cases and returns `caseId → names of failed checks`. */
async function failures(bug: string): Promise<Record<string, string[]>> {
  const form = spec(bug);
  const out: Record<string, string[]> = {};
  for (const c of generateFormCases(form).filter(wanted)) {
    const steps = caseSteps(form, c);
    const r = await e.run(steps);
    const failed = r.steps
      .map((s, i) => ({ s, step: steps[i] }))
      .filter(({ s }) => s.status === 'failed')
      .map(({ step }) => step?.name ?? '?');
    if (failed.length) out[c.id] = failed;
  }
  return out;
}

describe('validation checks on the demo registration form [R-05, R-07]', () => {
  it('a correct form passes every generated case', async () => {
    expect(await failures('')).toEqual({});
  }, 240_000);

  it('finds a wrong message text', async () => {
    const f = await failures('msg');
    expect(Object.keys(f)).toEqual(['email:maxLength.above']);
    expect(f['email:maxLength.above']).toEqual(['Thông báo lỗi của "Email"']);
  }, 240_000);

  it('finds an error shown next to another field', async () => {
    const f = await failures('field');
    expect(Object.keys(f).every((k) => k.startsWith('phone:'))).toBe(true);
    expect(Object.values(f).every((v) => v.includes('Thông báo lỗi của "Số điện thoại"'))).toBe(
      true,
    );
    expect(Object.keys(f).length).toBeGreaterThan(0);
  }, 240_000);

  it('finds cleared data, missing focus and a form sent despite errors', async () => {
    const cleared = await failures('clear');
    expect(Object.values(cleared).every((v) => v.some((n) => n.startsWith('Giữ dữ liệu')))).toBe(
      true,
    );
    expect(Object.keys(cleared).length).toBeGreaterThan(3);
    const nofocus = await failures('nofocus');
    expect(Object.values(nofocus).every((v) => v.some((n) => n.startsWith('Con trỏ')))).toBe(true);
    const sent = await failures('sent');
    expect(Object.values(sent).every((v) => v.includes('Form không được gửi'))).toBe(true);
    expect(Object.keys(sent).length).toBeGreaterThan(5);
  }, 480_000);

  it('finds values that do not round-trip (spaces kept, accents lost)', async () => {
    const trim = await failures('trim');
    expect(Object.keys(trim)).toEqual(['fullname:bad.whitespace-edges']);
    const accent = await failures('accent');
    expect(Object.keys(accent).sort()).toContain('fullname:bad.vietnamese-nfc');
    expect(accent['fullname:bad.vietnamese-nfc']).toEqual(['Lưu rồi đọc lại "Họ tên"']);
  }, 480_000);
});

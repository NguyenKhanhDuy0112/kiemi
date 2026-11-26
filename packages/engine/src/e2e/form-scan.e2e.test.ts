import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inferForm, scanForms } from '../forms';
import { type E2E, startE2E } from './helpers';

/** M11-02 [R-02]: the rules written in the HTML of a form are read back as a spec. */
let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

const HTML = `
<form id="register">
  <label for="email">Email *</label>
  <input id="email" name="email" type="email" required maxlength="100">
  <label for="phone">Số điện thoại</label>
  <input id="phone" name="phone" type="tel" pattern="0[0-9]{9}" minlength="10" maxlength="10" placeholder="0901234567">
  <label for="pw">Mật khẩu *</label>
  <input id="pw" name="pw" type="password" minlength="8">
  <label for="pw2">Xác nhận mật khẩu</label>
  <input id="pw2" name="pw2" type="password">
  <label for="age">Tuổi</label>
  <input id="age" name="age" type="number" min="18" max="99">
  <label for="city">Thành phố</label>
  <select id="city" name="city" required><option value="">-- Chọn --</option><option value="hn">Hà Nội</option><option value="hcm">TP.HCM</option></select>
  <fieldset><legend>Giới tính</legend>
    <label><input type="radio" name="sex" value="m" required> Nam</label>
    <label><input type="radio" name="sex" value="f"> Nữ</label></fieldset>
  <label for="cv">Hồ sơ</label>
  <input id="cv" name="cv" type="file" accept=".pdf,.docx">
  <label><input type="checkbox" name="agree"> Đồng ý điều khoản</label>
  <input type="hidden" name="csrf" value="x">
  <button type="submit">Gửi</button>
</form>`;

describe('scan + infer a form [R-02]', () => {
  it('fills in the rules the HTML declares', async () => {
    const page = await e.browser.newPage();
    try {
      await page.setContent(HTML);
      const scans = await scanForms(page);
      expect(scans).toHaveLength(1);
      const form = inferForm(scans[0] ?? { name: '', controls: [] }, 'f1', '/dang-ky');
      expect(form.name).toBe('register');
      const by = Object.fromEntries(form.fields.map((f) => [f.key, f]));
      expect(Object.keys(by)).toEqual([
        'email',
        'phone',
        'pw',
        'pw2',
        'age',
        'city',
        'sex',
        'cv',
        'agree',
      ]);
      expect(by.email).toMatchObject({
        label: 'Email',
        type: 'email',
        required: true,
        maxLength: 100,
      });
      expect(by.phone).toMatchObject({
        type: 'phone',
        minLength: 10,
        maxLength: 10,
        pattern: '0[0-9]{9}',
      });
      expect(by.pw).toMatchObject({ type: 'password', required: true, minLength: 8 });
      expect(by.pw2?.compare).toEqual({ field: 'pw', op: 'eq' });
      expect(by.age).toMatchObject({ type: 'number', min: 18, max: 99 });
      expect(by.city).toMatchObject({
        type: 'dropdown',
        required: true,
        options: ['Hà Nội', 'TP.HCM'],
      });
      expect(by.sex).toMatchObject({
        type: 'dropdown',
        label: 'Giới tính',
        options: ['m', 'f'],
        required: true,
      });
      expect(by.cv?.file?.extensions).toEqual(['pdf', 'docx']);
      expect(by.agree?.type).toBe('checkbox');
      // The location of each input is kept so generated tests can fill it in.
      expect(by.email?.locator?.strategies.at(-1)).toEqual({ kind: 'css', value: '#email' });
    } finally {
      await page.close();
    }
  });

  it('reads inputs that are outside any <form>', async () => {
    const page = await e.browser.newPage();
    try {
      await page.setContent('<label for="q">Từ khóa</label><input id="q" name="q" required>');
      const scans = await scanForms(page);
      expect(scans[0]?.controls[0]).toMatchObject({ label: 'Từ khóa', required: true });
    } finally {
      await page.close();
    }
  });
});

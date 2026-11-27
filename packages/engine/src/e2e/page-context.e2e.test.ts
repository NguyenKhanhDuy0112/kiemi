import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { capturePageContext, pageContextText } from '../forms';
import { type E2E, startE2E } from './helpers';

/** M16-03c [AI-17]: the assistant sees the roles, names and form rules of the open page. */
let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

describe('page context [AI-17]', () => {
  it('describes buttons and fields, without the values typed in', async () => {
    const page = await e.browser.newPage();
    try {
      await page.setContent(`<title>Đăng ký</title>
<h1>Tạo tài khoản</h1>
<form id="reg"><label for="em">Email *</label>
<input id="em" name="email" type="email" required maxlength="50" value="secret@x.vn">
<button type="submit">Gửi</button></form>`);
      const c = await capturePageContext(page);
      expect(c.title).toBe('Đăng ký');
      expect(c.aria).toContain('button "Gửi"');
      expect(c.aria).toContain('heading "Tạo tài khoản"');
      expect(c.forms[0]?.controls[0]?.value).toBe('');
      const text = pageContextText(c);
      expect(text).toContain('Email');
      expect(text).toContain('maxLength=50');
      expect(text).not.toContain('secret@x.vn');
    } finally {
      await page.close();
    }
  });
});

import type { Locator } from '@kiemi/schema';
import type { Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findSimilar } from '../locator/similar';
import { launchTestBrowser } from '../testing/browser';

/** FX-06: the element changed — find what looks like it by its fingerprint. */
let browser: Browser;
beforeAll(async () => {
  browser = await launchTestBrowser();
});
afterAll(async () => {
  await browser?.close();
});

const lost: Locator = {
  strategies: [{ kind: 'css', value: '#btn-save' }],
  fingerprint: {
    tag: 'button',
    text: 'Lưu',
    attributes: { id: 'btn-save', type: 'submit', class: 'btn primary' },
    neighbors: [],
    box: { x: 20, y: 20, width: 80, height: 30 },
  },
};

describe('findSimilar [FX-06]', () => {
  it('ranks the renamed button first and builds a locator that pins it', async () => {
    const page = await (await browser.newContext()).newPage();
    await page.setContent(`
      <button id="btn-cancel" class="btn" type="button">Hủy</button>
      <button id="btn-save-2" class="btn primary" type="submit" data-testid="save">Lưu lại</button>
      <button id="other" type="button">Xóa</button>`);
    const found = await findSimilar(page, lost);
    expect(found[0]?.label).toContain('Lưu lại');
    expect(found.every((c) => !c.label.includes('Xóa'))).toBe(true);
    const first = found[0] as NonNullable<(typeof found)[number]>;
    const css = first.locator.strategies.find((s) => s.kind === 'css');
    expect(css && 'value' in css && (await page.locator(css.value).count())).toBe(1);
    await page.context().close();
  });

  it('gives nothing without a fingerprint or without a lookalike', async () => {
    const page = await (await browser.newContext()).newPage();
    await page.setContent('<a href="/x">Trang chủ</a>');
    expect(await findSimilar(page, { strategies: [{ kind: 'css', value: '#x' }] })).toEqual([]);
    expect(await findSimilar(page, lost)).toEqual([]);
    await page.context().close();
  });
});

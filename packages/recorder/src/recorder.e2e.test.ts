import { type DemoSite, startDemoSite } from '@kiemi/demo-site/server';
import {
  createDefaultRegistry,
  resolveLocator,
  runTestCase,
  type SessionPages,
} from '@kiemi/engine';
import { type Locator, type Step, type StepInput, TestCaseSchema } from '@kiemi/schema';
import { type Browser, type BrowserContext, chromium } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { StepChange } from './collector';
import { type Recorder, type Suggestion, startRecorder } from './recorder';

let browser: Browser;
let site: DemoSite;
let context: BrowserContext | undefined;

async function launch(): Promise<Browser> {
  for (const channel of ['chrome', 'msedge', undefined] as const) {
    try {
      return await chromium.launch(channel ? { channel, headless: true } : { headless: true });
    } catch {
      // try the next browser
    }
  }
  throw new Error('No browser available for recorder tests');
}

beforeAll(async () => {
  [browser, site] = await Promise.all([launch(), startDemoSite()]);
});
afterAll(async () => {
  await browser?.close();
  await site?.close();
});
afterEach(async () => {
  await context?.close();
  context = undefined;
});

async function record(
  path: string,
  grace?: number,
  html?: Record<string, string>,
): Promise<Recorder> {
  await fetch(`${site.url}/api/reset`, { method: 'POST' });
  context = await browser.newContext();
  for (const [route, body] of Object.entries(html ?? {})) {
    await context.route(`${site.url}${route}`, (r) =>
      r.fulfill({ contentType: 'text/html; charset=utf-8', body }),
    );
  }
  return startRecorder(context, {
    startUrl: `${site.url}${path}`,
    baseUrl: site.url,
    ...(grace === undefined ? {} : { navigationGraceMs: grace }),
  });
}

/** Waits until the recorder has `n` steps (events arrive asynchronously). */
async function steps(rec: Recorder, n: number): Promise<Step[]> {
  await expect
    .poll(() => rec.steps.length, { timeout: 5000 })
    .toBe(n)
    .catch((e) => {
      console.log(JSON.stringify(rec.steps, null, 1)); // shows what was recorded
      throw e;
    });
  await new Promise((r) => setTimeout(r, 150)); // let trailing merges land
  expect(rec.steps).toHaveLength(n);
  return rec.steps;
}

const brief = (list: Step[]) =>
  list.map((s) => {
    const { target: _t, ...rest } = s.params;
    return `${s.action} ${JSON.stringify(rest)}`;
  });

/** Replays recorded steps (+ checks) with the engine on a fresh context. */
async function replay(recorded: Step[], checks: StepInput[] = []) {
  await fetch(`${site.url}/api/reset`, { method: 'POST' });
  const testCase = TestCaseSchema.parse({
    schemaVersion: 2,
    id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f11',
    name: 'recorded',
    steps: [...recorded, ...checks.map((s, i) => ({ ...s, id: `check${i + 1}` }))],
  });
  const result = await runTestCase(
    {
      runId: `replay-${Date.now()}`,
      testCase,
      env: {
        id: 'demo',
        name: 'Demo',
        baseUrl: site.url,
        variables: {},
        secretNames: [],
        apps: {},
      },
    },
    { registry: createDefaultRegistry(), browser },
  );
  const failed = result.steps
    .map((s, i) => `${i + 1} ${s.status}${s.error ? ` ${s.error.code} ${s.error.message}` : ''}`)
    .filter((s) => !s.includes('passed'));
  expect(failed).toEqual([]);
  expect(result.status).toBe('passed');
}

const check = (action: string, params: Record<string, unknown>): StepInput => ({
  id: 'x',
  action,
  params,
});

describe('recorder [K-01, K-02]', () => {
  it('records typing, choices, ticks and keys on a form and replays them', async () => {
    const rec = await record('/login.html');
    const page = rec.page;
    if (!page) throw new Error('no page');
    await page.locator('#username').pressSequentially('nhanvien');
    await page.locator('#password').pressSequentially('123456');
    await page.locator('#password').press('Enter');
    await page.waitForURL('**/form.html');
    await page.locator('#reason').click();
    await page.locator('#reason').pressSequentially('Đi khám bệnh');
    await page.locator('#days').pressSequentially('3');
    await page.locator('#days').press('Backspace');
    await page.locator('#days').pressSequentially('2');
    // A real choice (type-ahead) — `selectOption` fires untrusted events, which are not recorded.
    await page.locator('#department').focus();
    await page.keyboard.press('k');
    await page.getByText('Khẩn cấp').click();
    await page.getByText('SMS').click();
    await page.locator('#from-date').press('Escape');

    const list = await steps(rec, 10);
    expect(brief(list)).toEqual([
      'goto {"url":"/login.html"}',
      'fill {"value":"nhanvien"}',
      'fill {"value":"123456"}',
      'press {"keys":"Enter"}',
      'fill {"value":"Đi khám bệnh"}',
      'fill {"value":"2"}',
      'select {"by":"label","option":"Kế toán"}',
      'check {"checked":true}',
      'check {"checked":true}',
      'press {"keys":"Escape"}',
    ]);

    await replay(list, [
      check('assertValue', { target: { css: '#reason' }, value: 'Đi khám bệnh' }),
      check('assertValue', { target: { css: '#days' }, value: '2' }),
      check('assertState', { target: { css: '#urgent' }, state: 'checked' }),
      check('assertState', { target: { css: 'input[value=sms]' }, state: 'checked' }),
    ]);
  });

  it('records actions inside nested iframes', async () => {
    const rec = await record('/iframe.html');
    const frame = rec.page?.frameLocator('#outer-frame');
    if (!frame) throw new Error('no page');
    await frame.locator('#inner-name').pressSequentially('An');
    await frame.getByRole('button', { name: 'Chào' }).click();

    const list = await steps(rec, 3);
    expect(brief(list)).toEqual([
      'goto {"url":"/iframe.html"}',
      'fill {"value":"An"}',
      'click {"variant":"single"}',
    ]);
    await replay(list, [
      check('assertText', { target: { css: '#inner-result' }, value: 'Xin chào, An!' }),
    ]);
  });

  it('records a new tab opened by a link and switches to it', async () => {
    const rec = await record('/dialogs.html');
    const page = rec.page;
    if (!page) throw new Error('no page');
    // A real (trusted) mouse click, without Playwright waiting for the opener's navigations
    // (that wait hangs on slow macOS CI runners).
    const box = await page.locator('#link-new-tab').boundingBox();
    if (!box) throw new Error('link not visible');
    const [popup] = await Promise.all([
      page.context().waitForEvent('page'),
      page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
    ]);
    await popup.waitForLoadState();
    await popup.locator('#popup-note').pressSequentially('ghi chú');

    const list = await steps(rec, 4);
    expect(brief(list)).toEqual([
      'goto {"url":"/dialogs.html"}',
      'click {"variant":"single"}',
      'switchTab {"by":"index","value":"2"}',
      'fill {"value":"ghi chú"}',
    ]);
    await replay(list, [
      check('assertValue', { target: { css: '#popup-note' }, value: 'ghi chú' }),
    ]);
  });

  it('records loads the tester started, but not those caused by a click', async () => {
    const rec = await record('/index.html', 300);
    const page = rec.page;
    if (!page) throw new Error('no page');
    await page.locator('a[href="/login.html"]').first().click();
    await page.waitForURL('**/login.html');
    await new Promise((r) => setTimeout(r, 400));
    await page.goto(`${site.url}/table.html`);
    await new Promise((r) => setTimeout(r, 400));
    await page.reload();
    await page
      .locator('#username')
      .waitFor({ state: 'detached' })
      .catch(() => undefined);

    const list = await steps(rec, 4);
    expect(brief(list)).toEqual([
      'goto {"url":"/index.html"}',
      'click {"variant":"single"}',
      'goto {"url":"/table.html"}',
      'navigate {"to":"reload"}',
    ]);
  });

  it('records a double click as one step and Enter in a field', async () => {
    const rec = await record('/login.html');
    const page = rec.page;
    if (!page) throw new Error('no page');
    await page.locator('h1').dblclick();
    await page.locator('#username').pressSequentially('nhanvien');
    await page.locator('#username').press('Enter');

    const list = await steps(rec, 4);
    expect(brief(list)).toEqual([
      'goto {"url":"/login.html"}',
      'click {"variant":"double"}',
      'fill {"value":"nhanvien"}',
      'press {"keys":"Enter"}',
    ]);
  });

  it('stops recording on stop()', async () => {
    const rec = await record('/login.html');
    await steps(rec, 1);
    await rec.stop();
    await rec.page?.locator('#username').pressSequentially('x');
    await new Promise((r) => setTimeout(r, 300));
    expect(rec.steps).toHaveLength(1);
  });
});

describe('recorded locators [C-01, C-02]', () => {
  it('stores several strategies (role+name first) and a fingerprint, and each resolves', async () => {
    const rec = await record('/login.html');
    const page = rec.page;
    if (!page) throw new Error('no page');
    await page.locator('#username').pressSequentially('nhanvien');
    await page.locator('#password').pressSequentially('1');
    await page
      .getByRole('button', { name: 'Đăng nhập', exact: true })
      .click({ modifiers: ['Alt'] });

    const list = await steps(rec, 4);
    const targets = list.slice(1).map((s) => s.params.target as Locator);
    const kinds = targets.map((t) => t.strategies.map((s) => s.kind).join(','));
    expect(kinds).toEqual([
      'role,label,placeholder,css,css,css,xpath',
      'label,css,css,css,xpath',
      'role,text,css,xpath',
    ]);
    expect(targets[0]?.strategies[0]).toEqual({
      kind: 'role',
      role: 'textbox',
      name: 'Tên đăng nhập',
      exact: true,
    });
    expect(targets[0]?.fingerprint).toMatchObject({
      tag: 'input',
      attributes: { id: 'username', name: 'username', type: 'text' },
      neighbors: expect.arrayContaining(['Tên đăng nhập']),
    });
    // Password value never lands in the fingerprint.
    expect(JSON.stringify(targets[1]?.fingerprint)).not.toContain('"value"');

    // The preferred strategy finds the element; css / xpath fallbacks each pin it too.
    for (const t of targets) {
      const r = await resolveLocator(page, t, { timeoutMs: 1000 });
      expect(r.strategyIndex).toBe(0);
      for (const strategy of t.strategies.filter((x) => x.kind === 'css' || x.kind === 'xpath')) {
        const one = await resolveLocator(page, { strategies: [strategy] }, { timeoutMs: 1000 });
        expect(one.matchCount, JSON.stringify(strategy)).toBe(1);
      }
    }
  });

  it('names checkboxes / radios by their label and keeps the radio value in css', async () => {
    const rec = await record('/radio.html', undefined, {
      '/radio.html':
        '<fieldset><legend>Thông báo</legend><label><input type="radio" name="n" value="email"> Email</label>' +
        '<label><input type="radio" name="n" value="sms"> SMS</label></fieldset>',
    });
    const page = rec.page;
    if (!page) throw new Error('no page');
    await page.getByText('SMS').click();
    const list = await steps(rec, 2);
    const t = list[1]?.params.target as Locator;
    expect(t.strategies[0]).toEqual({ kind: 'role', role: 'radio', name: 'SMS', exact: true });
    expect(t.strategies).toContainEqual({ kind: 'css', value: 'input[name="n"][value="sms"]' });
    expect(t.fingerprint?.neighbors).toContain('Thông báo');
  });
});

describe('floating toolbar [K-03]', () => {
  it('adds checks and saved values by clicking elements, without recording those clicks', async () => {
    const rec = await record('/login.html');
    const page = rec.page;
    if (!page) throw new Error('no page');
    const bar = page.locator('kiemi-recorder .bar');
    await expect.poll(() => bar.count()).toBe(1);
    await page.locator('#username').pressSequentially('nhanvien');

    await bar.getByRole('button', { name: 'Thêm kiểm tra' }).click();
    await page.locator('h1').click();
    await page.getByRole('menuitem', { name: 'Có chữ “Đăng nhập”' }).click();

    await bar.getByRole('button', { name: 'Thêm kiểm tra' }).click();
    await page.locator('#username').click();
    await page.getByRole('menuitem', { name: 'Có giá trị “nhanvien”' }).click();

    await bar.getByRole('button', { name: 'Lưu giá trị' }).click();
    await page.locator('h1').click();
    await page.getByRole('textbox', { name: 'Tên biến' }).fill('1sai');
    await page.getByRole('menuitem', { name: 'Lưu chữ “Đăng nhập”' }).click();
    await expect
      .poll(() => page.locator('kiemi-recorder .err').textContent())
      .toContain('Tên biến');
    await page.getByRole('textbox', { name: 'Tên biến' }).fill('tieuDe');
    await page.getByRole('menuitem', { name: 'Lưu chữ “Đăng nhập”' }).click();

    // Esc cancels a pick: nothing added.
    await bar.getByRole('button', { name: 'Thêm kiểm tra' }).click();
    await page.keyboard.press('Escape');

    const list = await steps(rec, 5);
    expect(brief(list)).toEqual([
      'goto {"url":"/login.html"}',
      'fill {"value":"nhanvien"}',
      'assertText {"value":"Đăng nhập"}',
      'assertValue {"value":"nhanvien"}',
      'extract {"from":"text","into":"tieuDe"}',
    ]);
    await expect.poll(() => bar.textContent()).toContain('5 bước');
    await replay(list, [check('assertVariable', { name: 'tieuDe', value: 'Đăng nhập' })]);
  });

  it('asks the recorder to stop, and removes the toolbar once stopped', async () => {
    let stopAsked = 0;
    await fetch(`${site.url}/api/reset`, { method: 'POST' });
    context = await browser.newContext();
    const rec = await startRecorder(context, {
      startUrl: `${site.url}/iframe.html`,
      onStopRequest: () => stopAsked++,
    });
    const page = rec.page;
    if (!page) throw new Error('no page');
    // Only the top frame shows the toolbar.
    await expect.poll(() => page.locator('kiemi-recorder .bar').count()).toBe(1);
    expect(await page.frameLocator('#outer-frame').locator('kiemi-recorder .bar').count()).toBe(0);
    await page.getByRole('button', { name: 'Dừng' }).click();
    await expect.poll(() => stopAsked).toBe(1);
    await rec.stop();
    expect(await page.locator('kiemi-recorder').count()).toBe(0);
  });
});

describe('Pick and Highlight [C-06]', () => {
  it('picks an element inside an iframe without acting on the page or recording', async () => {
    await fetch(`${site.url}/api/reset`, { method: 'POST' });
    context = await browser.newContext();
    const rec = await startRecorder(context, {
      startUrl: `${site.url}/iframe.html`,
      capture: false,
      toolbar: false,
    });
    const page = rec.page;
    if (!page) throw new Error('no page');
    const frame = page.frameLocator('#outer-frame');
    await frame.locator('#inner-greet').waitFor();
    const picked = rec.pick();
    await new Promise((r) => setTimeout(r, 200));
    await frame.getByRole('button', { name: 'Chào' }).click();
    const locator = await picked;
    expect(locator?.strategies[0]).toEqual({
      kind: 'role',
      role: 'button',
      name: 'Chào',
      exact: true,
    });
    // The click was swallowed: the greeting did not run.
    expect(await frame.locator('#inner-result').textContent()).toBe('');
    expect(rec.steps).toEqual([]);

    // Esc → null.
    const cancelled = rec.pick();
    await new Promise((r) => setTimeout(r, 200));
    await page.keyboard.press('Escape');
    expect(await cancelled).toBeNull();
  });

  it('highlights where a locator points and reports 0 / 1 / several matches', async () => {
    const rec = await record('/form.html', undefined);
    const page = rec.page;
    if (!page) throw new Error('no page');
    await page.locator('#username').pressSequentially('nhanvien');
    const one = await rec.highlight({ strategies: [{ kind: 'css', value: '#username' }] });
    expect(one).toEqual({ count: 1, strategyIndex: 0 });
    expect(await page.locator('kiemi-recorder .mark').count()).toBe(1);

    const many = await rec.highlight({ strategies: [{ kind: 'css', value: 'input' }] });
    expect(many.count).toBe(2);
    expect(await page.locator('kiemi-recorder .mark.many').count()).toBe(2);
    expect(await page.locator('kiemi-recorder .mark .tag').first().textContent()).toBe(
      '2 phần tử khớp',
    );

    const none = await rec.highlight({ strategies: [{ kind: 'css', value: '#nope' }] });
    expect(none).toEqual({ count: 0 });
    expect(await page.locator('kiemi-recorder .mark').count()).toBe(0);
  });
});

describe('record from step X, passwords [K-04, K-05]', () => {
  it('continues recording in the browser left at step X', async () => {
    let kept: SessionPages | undefined;
    const testCase = TestCaseSchema.parse({
      schemaVersion: 2,
      id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f13',
      name: 'prefix',
      steps: [
        { id: 's1', action: 'goto', params: { url: '/login.html' } },
        { id: 's2', action: 'fill', params: { target: { css: '#username' }, value: 'nhanvien' } },
        { id: 's3', action: 'click', params: { target: { css: 'h1' } } },
      ],
    });
    await fetch(`${site.url}/api/reset`, { method: 'POST' });
    await runTestCase(
      {
        runId: 'prefix-1',
        testCase,
        env: {
          id: 'demo',
          name: 'Demo',
          baseUrl: site.url,
          variables: {},
          secretNames: [],
          apps: {},
        },
        options: { stopAfterStepId: 's2' },
      },
      { registry: createDefaultRegistry(), browser, keepSessions: (p) => (kept = p) },
    );
    if (!kept) throw new Error('not kept');
    const ctx = await kept.context('default');
    const changes: StepChange[] = [];
    const rec = await startRecorder(ctx, {
      baseUrl: site.url,
      onChange: (c) => changes.push(...c),
    });
    const page = await kept.page('default');
    await page.locator('#password').pressSequentially('123456');
    const list = await steps(rec, 1);
    expect(brief(list)).toEqual(['fill {"value":"123456"}']);
    // Typed into a password field → the app offers a Secret.
    expect(changes.at(-1)).toMatchObject({ type: 'update', password: true });
    await rec.stop();
    await kept.closeAll();
  });
});

describe('suggested checks [M-01]', () => {
  const page1 = `<!doctype html><meta charset="utf-8"><title>Danh sách</title>
<button id="add" onclick="setTimeout(() => {
  const m = document.getElementById('msg'); m.textContent = 'Đã lưu thành công'; m.hidden = false;
  const tr = document.createElement('tr'); tr.innerHTML = '<td>NV003</td><td>Lê Cường</td>';
  document.querySelector('#t tbody').append(tr);
}, 200)">Thêm</button>
<div id="msg" role="status" hidden></div>
<table id="t"><thead><tr><th>Mã</th><th>Tên</th></tr></thead><tbody><tr><td>NV001</td><td>An</td></tr></tbody></table>
<a href="/other.html">Sang trang khác</a>`;

  it('proposes checks for a new message, a new row and a new address; ✓ adds them', async () => {
    const seen: Suggestion[][] = [];
    await fetch(`${site.url}/api/reset`, { method: 'POST' });
    context = await browser.newContext();
    for (const [path, body] of Object.entries({
      '/list.html': page1,
      '/other.html': '<h1>Khác</h1>',
    }))
      await context.route(`${site.url}${path}`, (r) =>
        r.fulfill({ contentType: 'text/html; charset=utf-8', body }),
      );
    const rec = await startRecorder(context, {
      startUrl: `${site.url}/list.html`,
      baseUrl: site.url,
      onSuggestions: (l) => seen.push(l),
    });
    const page = rec.page;
    if (!page) throw new Error('no page');
    await page.locator('#add').click();
    await expect.poll(() => rec.suggestions().length, { timeout: 5000 }).toBe(2);
    expect(rec.suggestions().map((x) => `${x.kind}: ${x.text}`)).toEqual([
      'toast: Đã lưu thành công',
      'row: NV003 Lê Cường',
    ]);
    // Shown in the page, with ✓ / ✕.
    const items = page.locator('kiemi-recorder .sug');
    await expect.poll(() => items.count()).toBe(2);
    await items.first().locator('button.ok').click();
    await expect.poll(() => rec.suggestions().length).toBe(1);
    const row = rec.suggestions()[0];
    if (!row) throw new Error('no row suggestion');
    rec.resolveSuggestion(row.id, true);

    await page.getByRole('link', { name: 'Sang trang khác' }).click();
    await page.waitForURL('**/other.html');
    await expect.poll(() => rec.suggestions().map((x) => x.kind)).toEqual(['url']);
    rec.resolveSuggestion(rec.suggestions()[0]?.id ?? '', false);

    const list = await steps(rec, 5);
    expect(brief(list)).toEqual([
      'goto {"url":"/list.html"}',
      'click {"variant":"single"}',
      'assertToast {"text":"Đã lưu thành công","op":"contains"}',
      'assertVisible {}',
      'click {"variant":"single"}',
    ]);
    expect((list[3]?.params.target as Locator | undefined)?.strategies[0]).toEqual({
      kind: 'role',
      role: 'cell',
      name: 'NV003',
      exact: true,
    });
    expect(seen.at(-1)).toEqual([]);
  });
});

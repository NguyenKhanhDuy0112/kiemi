import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SharedStepInput } from '@kiemi/schema';
import { SharedStepSchema } from '@kiemi/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EngineEvent } from '../events';
import { type E2E, startE2E, step, summary } from './helpers';

let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

const login: SharedStepInput = {
  id: 'login',
  name: 'Đăng nhập',
  params: ['user', 'pass'],
  steps: [
    { id: 'l1', action: 'goto', params: { url: '/login.html' } },
    {
      id: 'l2',
      action: 'fill',
      params: { target: { label: 'Tên đăng nhập' }, value: '{{param.user}}' },
    },
    {
      id: 'l3',
      action: 'fill',
      params: { target: { label: 'Mật khẩu' }, value: '{{param.pass}}' },
    },
    { id: 'l4', action: 'click', params: { target: { role: 'button', name: 'Đăng nhập' } } },
  ],
};
const shared = { sharedSteps: [SharedStepSchema.parse(login)] };
const asNhanVien = step('call', { shared: 'login', args: { user: 'nhanvien', pass: '123456' } });

describe('navigation & input [A-01 → A-12]', () => {
  it('fills the leave form with every kind of input', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiemi-upload-'));
    await writeFile(join(dir, 'giay-kham.txt'), 'giấy khám bệnh');
    const r = await e.run(
      [
        asNhanVien,
        step('assertUrl', { op: 'contains', value: '/form.html' }),
        step('select', { target: { role: 'button', name: 'Loại nghỉ' }, option: 'Nghỉ ốm' }), // custom dropdown
        step('select', { target: { label: 'Bộ phận' }, option: 'Kỹ thuật' }), // native select by text
        step('select', { target: { label: 'Bộ phận' }, by: 'value', option: 'nhan-su' }),
        step('select', { target: { label: 'Bộ phận' }, by: 'index', option: 2 }),
        step('pickDate', { target: { label: 'Từ ngày' }, value: '{{today + 3d}}' }),
        step('fill', { target: { label: 'Số ngày' }, value: '{{1 + 1}}' }),
        step('fill', { target: { label: 'Lý do' }, value: 'Đi khám' }),
        step('fill', { target: { label: 'Lý do' }, value: ' bệnh', clear: false }),
        step('fill', {
          target: { role: 'textbox', name: 'Ghi chú' },
          value: 'Ghi chú contenteditable',
        }),
        step('check', { target: { label: 'Khẩn cấp' } }),
        step('check', { target: { label: 'SMS' } }),
        step('upload', { target: { label: 'Đính kèm' }, files: 'giay-kham.txt' }),
        step('hover', { target: { role: 'button', name: 'Gửi đơn' } }),
        step('scroll', { to: 'bottom' }),
        step('assertValue', { target: { label: 'Bộ phận' }, value: 'ke-toan' }),
        step('assertValue', { target: { label: 'Lý do' }, value: 'Đi khám bệnh' }),
        step('assertState', { target: { label: 'Khẩn cấp' }, state: 'checked' }),
        step('assertState', { target: { label: 'Email' }, state: 'unchecked' }),
        step('click', { target: { role: 'button', name: 'Gửi đơn' } }),
        step('assertVisible', { target: { text: 'Mã đơn:' } }),
        step('extract', { target: { css: '#ma-don' }, into: 'maDon' }),
        step('assertText', { target: { css: '#ma-don' }, op: 'regex', value: '^DN-?\\w+' }),
      ],
      { ...shared, request: { options: { filesDir: dir } } },
    );
    expect(summary(r)).not.toContainEqual(expect.stringMatching(/failed/));
    expect(r.status).toBe('passed');
  });

  it('clears, presses keys, reloads and goes back/forward', async () => {
    const r = await e.run(
      [
        asNhanVien,
        step('fill', { target: { label: 'Lý do' }, value: 'abc' }),
        step('clear', { target: { label: 'Lý do' } }),
        step('assertValue', { target: { label: 'Lý do' }, op: 'empty' }),
        step('press', { target: { label: 'Số ngày' }, keys: 'ArrowUp' }),
        step('assertValue', { target: { label: 'Số ngày' }, value: '1' }),
        step('press', { keys: 'ctrl+a' }),
        step('goto', { url: '/table.html' }),
        step('navigate', { to: 'back' }),
        step('assertUrl', { op: 'contains', value: 'form.html' }),
        step('navigate', { to: 'forward' }),
        step('assertUrl', { op: 'contains', value: 'table.html' }),
        step('navigate', { to: 'reload' }),
        step(
          'click',
          { target: { text: 'Không có', exact: true } },
          { mode: 'soft', timeoutMs: 1500 },
        ),
      ],
      shared,
    );
    expect(summary(r).filter((x) => !x.includes('.'))).toEqual([
      '1 passed',
      '2 passed',
      '3 passed',
      '4 passed',
      '5 passed',
      '6 passed',
      '7 passed',
      '8 passed',
      '9 passed',
      '10 passed',
      '11 passed',
      '12 passed',
      '13 passed',
      '14 failed ELEMENT_NOT_FOUND',
    ]);
    expect(r.status).toBe('failed'); // soft failure still fails the run
  });
});

describe('tabs, dialogs, iframes, sessions, storage [A-13 → A-18, F-01]', () => {
  it('answers alert / confirm / prompt', async () => {
    const r = await e.run([
      step('goto', { url: '/dialogs.html' }),
      step('click', { target: { role: 'button', name: 'Hiện thông báo' } }),
      step('assertVariable', { name: 'dialogMessage', value: 'Đây là thông báo từ Kiemi Demo' }),
      step('dialog', { action: 'dismiss' }),
      step('click', { target: { role: 'button', name: 'Hỏi xác nhận' } }),
      step('assertText', { target: { css: '#dialog-result' }, value: 'Đã hủy' }),
      step('click', { target: { role: 'button', name: 'Hỏi xác nhận' } }),
      step('assertText', { target: { css: '#dialog-result' }, value: 'Đã đồng ý' }),
      step('dialog', { action: 'accept', text: 'Kiemi' }),
      step('click', { target: { role: 'button', name: 'Nhập tên' } }),
      step('assertText', { target: { css: '#dialog-result' }, op: 'contains', value: 'Kiemi' }),
    ]);
    expect(summary(r)).not.toContainEqual(expect.stringMatching(/failed/));
  });

  it('follows popups and new tabs, switches and closes them', async () => {
    const r = await e.run([
      step('goto', { url: '/dialogs.html' }),
      step('click', { target: { role: 'link', name: 'Mở trong tab mới' } }),
      step('assertUrl', { op: 'contains', value: 'popup.html' }), // new tab became active
      step('switchTab', { by: 'index', value: 1 }),
      step('assertTitle', { op: 'contains', value: 'Hộp thoại' }),
      step('newTab', { url: '/table.html' }),
      step('switchTab', { by: 'url', value: 'popup' }),
      step('closeTab', {}),
      step('switchTab', { by: 'url', value: 'table' }),
      step('closeTab', { index: 2 }),
      step('switchTab', { by: 'title', value: 'không có' }, { mode: 'soft', timeoutMs: 1500 }),
    ]);
    expect(summary(r)).toEqual([
      '1 passed',
      '2 passed',
      '3 passed',
      '4 passed',
      '5 passed',
      '6 passed',
      '7 passed',
      '8 passed',
      '9 passed',
      '10 passed',
      '11 failed TAB_NOT_FOUND',
    ]);
  });

  it('names tabs, switches by name 10 times and counts tabs [V-01]', async () => {
    const steps = [
      step('goto', { url: '/dialogs.html' }),
      step('click', { target: { role: 'link', name: 'Mở trong tab mới' } }),
      step('captureTab', { name: 'popup', urlContains: 'popup.html' }),
      step('newTab', { url: '/table.html', name: 'bang' }),
      step('assertTabCount', { count: 3 }),
    ];
    for (let i = 0; i < 5; i++) {
      steps.push(
        step('switchTab', { by: 'name', value: 'main' }),
        step('assertTitle', { op: 'contains', value: 'Hộp thoại' }),
        step('switchTab', { by: 'name', value: 'popup' }),
        step('assertUrl', { op: 'contains', value: 'popup.html' }),
      );
    }
    steps.push(
      // A step pinned to a tab switches to it first.
      step('assertUrl', { op: 'contains', value: 'table.html' }, { tab: 'bang' }),
      step('closeTab', { name: 'popup' }),
      step('assertTabCount', { count: 2 }),
      step('switchTab', { by: 'name', value: 'popup' }, { mode: 'soft', timeoutMs: 1500 }),
      step('assertTabCount', { count: 5 }, { mode: 'soft', timeoutMs: 800 }),
    );
    const r = await e.run(steps);
    const sm = summary(r);
    expect(sm.slice(0, 5)).toEqual(['1 passed', '2 passed', '3 passed', '4 passed', '5 passed']);
    expect(sm.slice(5, 25).every((x) => x.endsWith('passed'))).toBe(true);
    expect(sm.slice(25)).toEqual([
      '26 passed',
      '27 passed',
      '28 passed',
      '29 failed TAB_NOT_FOUND',
      '30 failed ASSERTION_FAILED',
    ]);
  });

  it('opens pages in another session and in another browser [V-02]', async () => {
    const before = e.launched.length;
    const r = await e.run(
      [
        step('goto', { url: '/table.html' }),
        step('openIn', { session: 'khach', url: '/dialogs.html' }),
        step('assertTitle', { op: 'contains', value: 'Hộp thoại' }, { session: 'khach' }),
        step('openIn', { session: 'khach', url: '/popup.html', name: 'phu' }),
        step('assertTabCount', { count: 2 }, { session: 'khach' }),
        step('assertTabCount', { count: 1 }), // the first session is untouched
        step('openIn', { session: 'edge', url: '/form.html', browser: 'chromium' }),
        step('assertUrl', { op: 'contains', value: 'form.html' }, { session: 'edge' }),
        step('assertUrl', { op: 'contains', value: 'table.html' }), // default session stays on its page
        step('openIn', { session: 'edge', url: '/form.html', browser: 'msedge' }, { mode: 'soft' }),
      ],
      { sessions: ['default', 'khach', 'edge'] },
    );
    expect(summary(r)).toEqual([
      '1 passed',
      '2 passed',
      '3 passed',
      '4 passed',
      '5 passed',
      '6 passed',
      '7 passed',
      '8 passed',
      '9 passed',
      '10 failed ACTION_FAILED',
    ]);
    expect(e.launched.length - before).toBe(1);
  });

  it('finds elements inside nested iframes automatically', async () => {
    const r = await e.run([
      step('goto', { url: '/iframe.html' }),
      step('fill', { target: { label: 'Tên của bạn' }, value: 'Hoa' }),
      step('click', { target: { role: 'button', name: 'Chào' } }),
      step('assertText', { target: { text: 'Xin chào, Hoa!' }, value: 'Xin chào, Hoa!' }),
      step('click', { target: { role: 'button', name: 'Xác nhận' } }),
      step('assertText', { target: { css: '#nested-result' }, value: 'Đã xác nhận (1)' }),
    ]);
    expect(summary(r)).not.toContainEqual(expect.stringMatching(/failed/));
  });

  it('keeps sessions apart and switches between them; clears cookies; waits', async () => {
    const events: EngineEvent[] = [];
    const r = await e.run(
      [
        { ...asNhanVien, session: 'A' },
        step('switchSession', {}, { session: 'B' }),
        step('goto', { url: '/form.html' }, { session: 'B' }),
        step('assertUrl', { op: 'contains', value: 'login.html' }, { session: 'B' }), // B is not logged in
        step('goto', { url: '/form.html' }, { session: 'A' }),
        step('assertUrl', { op: 'contains', value: 'form.html' }, { session: 'A' }),
        step('clearData', {}, { session: 'A' }),
        step('goto', { url: '/form.html' }, { session: 'A' }),
        step('assertUrl', { op: 'contains', value: 'login.html' }, { session: 'A' }),
        step('wait', { seconds: 0.2 }, { session: 'A' }),
      ],
      { ...shared, sessions: ['A', 'B'], events },
    );
    expect(summary(r)).not.toContainEqual(expect.stringMatching(/failed/));
    const starts = events.filter(
      (x) => x.type === 'stepStart' && !('parentStepId' in x && x.parentStepId),
    );
    expect(starts.map((x) => (x.type === 'stepStart' ? x.session : ''))).toEqual([
      'A',
      'B',
      'B',
      'B',
      'A',
      'A',
      'A',
      'A',
      'A',
      'A',
    ]);
  });
});

describe('variables & flow [E-04, D-01 → D-04, D-06]', () => {
  it('saves values, branches, loops and skips conditionally', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/table.html' }),
        step('extract', { from: 'url', regex: '/(\\w+)\\.html', into: 'page' }),
        step('assertVariable', { name: 'page', value: 'table' }),
        step('extract', {
          target: { css: '#products-table tbody tr:first-child td:first-child' },
          into: 'firstSku',
        }),
        step(
          'extract',
          { target: { label: 'Tìm kiếm' }, from: 'attribute', attribute: 'id', into: 'searchId' },
          { mode: 'soft' },
        ),
        step('if', {
          condition: { assert: 'visible', target: { css: '#products-table' } },
          steps: [{ id: 'i1', action: 'extract', params: { from: 'title', into: 'branch' } }],
          elseSteps: [{ id: 'i2', action: 'goto', params: { url: '/nowhere' } }],
        }),
        step('if', {
          condition: { not: { variable: 'page', op: 'equals', value: 'table' } },
          steps: [{ id: 'i3', action: 'goto', params: { url: '/nowhere' } }],
        }),
        step('loop', {
          over: 'times',
          times: 3,
          steps: [
            { id: 'lp1', action: 'extract', params: { from: 'title', into: 'iter', regex: '(.)' } },
          ],
        }),
        step('loop', {
          over: 'tableRows',
          target: { css: '#products-table' },
          steps: [
            { id: 'lp2', action: 'assertVariable', params: { name: 'loop', op: 'notEmpty' } },
          ],
        }),
        step('goto', { url: '/nowhere' }, { skipIf: { variable: 'page', value: 'table' } }),
        step('waitUntil', {
          condition: { assert: 'title', op: 'contains', value: '{{branch}}' },
          timeoutSec: 2,
        }),
        step(
          'waitUntil',
          {
            condition: { assert: 'visible', target: { text: 'Không bao giờ' } },
            timeoutSec: 1,
            intervalSec: 0.3,
            reloadEverySec: 0.5,
          },
          { mode: 'soft' },
        ),
      ],
      shared,
    );
    const s = summary(r);
    expect(s).toContain('6 passed');
    expect(s).toContain('6.1 passed');
    expect(s).toContain('7 passed');
    expect(s.filter((x) => x.startsWith('8.'))).toEqual(['8.1 passed', '8.2 passed', '8.3 passed']);
    expect(s.filter((x) => x.startsWith('9.')).length).toBe(10); // one page of products
    expect(s).toContain('10 skipped');
    expect(s).toContain('11 passed');
    expect(s).toContain('12 failed CONDITION_TIMEOUT');
  });

  it('a failing nested step fails its parent with the same error', async () => {
    const r = await e.run(
      [
        step('if', {
          condition: { variable: 'x', op: 'empty' },
          // ≥ a few seconds: opening the first blank tab alone can take 1.5 s on CI runners.
          steps: [{ id: 'n1', action: 'assertTitle', params: { value: 'sai' }, timeoutMs: 5000 }],
        }),
      ],
      { variables: { x: '' } },
    );
    expect(summary(r)).toEqual(['1 failed ASSERTION_FAILED', '1.1 failed ASSERTION_FAILED']);
    expect(r.steps[0]?.error?.details).toMatchObject({ stepNo: '1.1' });
  });

  it('reports unknown variables and shared steps', async () => {
    const r = await e.run(
      [
        step('goto', { url: '{{khongCo}}' }, { mode: 'soft' }),
        step('call', { shared: 'nope' }, { mode: 'soft' }),
        step('call', { shared: 'login', args: { user: 'x' } }, { mode: 'soft' }),
      ],
      shared,
    );
    expect(summary(r)).toEqual([
      '1 failed UNKNOWN_VARIABLE',
      '2 failed UNKNOWN_SHARED_STEP',
      '3 failed INVALID_PARAMS',
    ]);
  });
});

describe('API & page errors [F-03, F-04]', () => {
  it('calls an API, saves the response and checks status / fields', async () => {
    const r = await e.run([
      step('api', {
        method: 'POST',
        url: '/api/login',
        body: { username: 'nhanvien', password: '123456' },
        saveTo: 'res',
        expectStatus: 200,
        expectFields: [{ path: 'user.role', value: 'nhanvien' }],
      }),
      step('assertVariable', { name: 'res', op: 'contains', value: 'Nguyễn Văn An' }),
      step('api', { url: '/api/meta', expectStatus: [200, 201] }),
      step(
        'api',
        {
          method: 'POST',
          url: '/api/login',
          body: { username: 'x', password: 'y' },
          expectStatus: 200,
        },
        { mode: 'soft' },
      ),
      step('api', { url: 'http://127.0.0.1:1/' }, { mode: 'soft' }),
    ]);
    expect(summary(r)).toEqual([
      '1 passed',
      '2 passed',
      '3 passed',
      '4 failed ASSERTION_FAILED',
      '5 failed API_ERROR',
    ]);
  });

  it('records failed requests and can fail on them', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/api/khong-co' }, { mode: 'soft' }),
        step('goto', { url: '/table.html' }),
      ],
      { request: { options: { failOnHttpError: true } } },
    );
    expect(summary(r)).toEqual(['1 failed HTTP_ERROR', '2 passed']);
    expect(r.diagnostics.some((d) => d.kind === 'http' && (d.status ?? 0) >= 400)).toBe(true);
  });

  it('records console errors and can fail on them', async () => {
    const r = await e.run(
      [step('goto', { url: '/table.html' }), step('api', { url: '/api/meta' })],
      { request: { options: { failOnConsoleError: true } } },
    );
    expect(r.status).toBe('passed');
  });
});

describe('artifacts & secrets [I-01 → I-03, E-08]', () => {
  it('takes a highlighted screenshot of failed steps, records video and trace, masks secrets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiemi-art-'));
    const events: EngineEvent[] = [];
    const r = await e.run(
      [
        step('goto', { url: '/login.html' }),
        step('fill', { target: { label: 'Tên đăng nhập' }, value: 'nhanvien' }),
        step('fill', { target: { label: 'Mật khẩu' }, value: '{{secret.nvPass}}' }),
        step(
          'assertValue',
          { target: { label: 'Mật khẩu' }, value: 'sai-{{secret.nvPass}}' },
          { timeoutMs: 1500 },
        ),
      ],
      {
        events,
        request: {
          secrets: { nvPass: '123456' },
          options: { artifacts: { dir, video: true, trace: true } },
        },
      },
    );
    expect(summary(r)).toEqual(['1 passed', '2 passed', '3 passed', '4 failed ASSERTION_FAILED']);
    const failed = r.steps[3];
    expect(failed?.artifacts).toEqual([{ kind: 'screenshot', path: 'step-4-failed.png' }]);
    expect(JSON.stringify(failed?.error)).not.toContain('123456');
    expect(JSON.stringify(failed?.error)).toContain('••••');
    expect(r.artifacts.map((a) => a.kind).sort()).toEqual(['trace', 'video']);
    const files = await readdir(dir, { recursive: true });
    expect(files).toContain('step-4-failed.png');
    expect(files).toContain('trace-default.zip');
    expect(files.some((f) => f.endsWith('.webm'))).toBe(true);
    const logs = events
      .filter((x) => x.type === 'log')
      .map((x) => (x.type === 'log' ? x.message : ''));
    expect(logs.join('\n')).not.toContain('123456');
  });

  it('can screenshot every step', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiemi-art-'));
    const r = await e.run(
      [step('goto', { url: '/table.html' }), step('scroll', { to: 'bottom' })],
      {
        request: { options: { artifacts: { dir, screenshots: 'always' } } },
      },
    );
    expect(r.steps.map((s) => s.artifacts[0]?.path)).toEqual([
      'step-1-passed.png',
      'step-2-passed.png',
    ]);
  });
});

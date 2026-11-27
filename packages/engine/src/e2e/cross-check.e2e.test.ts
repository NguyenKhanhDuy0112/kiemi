import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2E, startE2E, step, summary } from './helpers';

/** M15-03 [V-04, V-06, V-07]: realtime without reload, noted values, propagation. */
let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

const quick = { request: { options: { defaultStepTimeoutMs: 5000 } } };
const bad = (r: ReturnType<typeof summary>) => r.filter((x) => !x.endsWith('passed'));
const list = { css: '#messages' };
const send = (text: string) => [
  step('fill', { target: { css: '#msg' }, value: text }, { session: 'gui' }),
  step('click', { target: { role: 'button', name: 'Gửi' } }, { session: 'gui' }),
];

describe('realtime update without reload [V-04]', () => {
  it('passes when the other tab updates by itself', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/chat.html' }),
        step('markLive', {}),
        step('openIn', { session: 'gui', url: '/chat.html' }),
        ...send('Xin chào cả nhóm'),
        step('assertLive', { target: list, op: 'contains', value: 'Xin chào cả nhóm' }),
      ],
      { sessions: ['default', 'gui'], ...quick },
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('fails with the right reason when realtime is off', async () => {
    const r = await e.run(
      [
        step('api', { method: 'POST', url: '{{app}}/api/chat', body: { realtime: false } }),
        step('goto', { url: '/chat.html' }),
        step('markLive', {}),
        step('openIn', { session: 'gui', url: '/chat.html' }),
        ...send('Không ai thấy'),
        step('assertLive', { target: list, op: 'contains', value: 'Không ai thấy' }),
      ],
      { sessions: ['default', 'gui'], ...quick },
    );
    const last = r.steps.at(-1);
    expect(last?.status).toBe('failed');
    expect(last?.error?.code).toBe('ASSERTION_FAILED');
  });

  it('says the page was reloaded when it was', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/chat.html' }),
        step('markLive', {}),
        step('navigate', { to: 'reload' }),
        step('assertLive', { target: list, op: 'notContains', value: 'zzz' }),
      ],
      quick,
    );
    const last = r.steps.at(-1);
    expect(last?.status).toBe('failed');
    expect(last?.error?.message).toContain('reloaded');
  });
});

describe('noted values [V-06]', () => {
  it('returns what observe noted, in the run result', async () => {
    const r = await e.run([
      step('goto', { url: '/promo.html' }),
      step('assertText', { target: { css: '#price' }, value: '99.000 ₫' }),
      step('observe', { name: 'giaKhuyenMai', value: '99000' }),
      step('observe', { name: 'trangThai', value: 'Đang khuyến mãi' }),
    ]);
    expect(r.observations).toEqual({ giaKhuyenMai: '99000', trangThai: 'Đang khuyến mãi' });
  });
});

describe('propagation check [V-07]', () => {
  it('runs every place and names the ones the change did not reach', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/chat.html' }),
        step('propagate', {
          steps: [
            {
              id: 'p-list',
              action: 'assertText',
              params: { target: list, op: 'contains', value: 'có' },
            },
            {
              id: 'p-state',
              action: 'assertText',
              params: { target: { css: '#live-state' }, op: 'contains', value: 'bật' },
            },
            {
              id: 'p-report',
              action: 'assertText',
              params: { target: list, op: 'contains', value: 'báo cáo' },
            },
          ],
        }),
      ],
      quick,
    );
    const top = r.steps.at(-1);
    expect(top?.error?.code).toBe('PROPAGATION_FAILED');
    expect(top?.error?.details?.places).toBe('p-list, p-report');
    expect(top?.children?.map((c) => c.status)).toEqual(['failed', 'passed', 'failed']);
  });

  it('passes when every place has the change', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/chat.html' }),
        step('propagate', {
          steps: [
            {
              id: 'a',
              action: 'assertText',
              params: { target: { css: '#live-state' }, op: 'contains', value: 'bật' },
            },
          ],
        }),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
  });
});

describe('browser environment [Y-02, Y-03, Y-04, Y-05]', () => {
  const sendBtn = { role: 'button', name: 'Gửi' } as const;

  it('checks the request the page sent, with its body fields', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/chat.html' }),
        step('fill', { target: { css: '#msg' }, value: 'Xin chào' }),
        step('click', { target: sendBtn }),
        step('assertRequest', {
          url: '/api/chat',
          method: 'POST',
          fields: [{ path: 'text', value: 'Xin chào' }],
        }),
        step('assertRequest', { url: '/api/khong-co', exists: false }),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('fails clearly when the expected request was not sent', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/chat.html' }),
        step('assertRequest', { url: '/api/purchase', method: 'POST' }),
      ],
      { request: { options: { defaultStepTimeoutMs: 1500 } } },
    );
    expect(r.steps.at(-1)?.error?.code).toBe('ASSERTION_FAILED');
  });

  it('keeps the typed text when the network is gone, and recovers', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/chat.html' }),
        step('network', { mode: 'offline' }),
        step('fill', { target: { css: '#msg' }, value: 'Giữ lại nhé' }),
        step('click', { target: sendBtn }),
        step('assertValue', { target: { css: '#msg' }, value: 'Giữ lại nhé' }),
        step('network', { mode: 'online' }),
        step('click', { target: sendBtn }),
        step('assertText', { target: list, op: 'contains', value: 'Giữ lại nhé' }),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('slows the connection down and back', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/chat.html' }),
        step('network', { mode: 'slow3g' }),
        step('network', { mode: 'normal' }),
        step('permission', {
          op: 'grant',
          permissions: ['geolocation'],
          latitude: 21,
          longitude: 105,
        }),
        step('permission', { op: 'deny', permissions: ['notifications'] }),
        step('permission', { op: 'reset', permissions: ['geolocation'] }),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('writes, checks and pastes the clipboard', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/chat.html' }),
        step('clipboard', { op: 'write', value: 'Mã giảm giá GIAM10' }),
        step('clipboard', { op: 'assert', value: 'GIAM10', match: 'contains' }),
        step('click', { target: { css: '#msg' } }),
        step('clipboard', { op: 'paste' }),
        step('assertValue', { target: { css: '#msg' }, value: 'Mã giảm giá GIAM10' }),
        step('clipboard', { op: 'assert', value: 'khác', match: 'contains' }),
      ],
      { request: { options: { defaultStepTimeoutMs: 2000 } } },
    );
    const s = summary(r);
    expect(s.slice(0, 6).filter((x) => !x.endsWith('passed'))).toEqual([]);
    expect(s[6]).toBe('7 failed ASSERTION_FAILED');
  });
});

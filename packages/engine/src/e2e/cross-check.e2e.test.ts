import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanInteractive } from '../forms/interactive';
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

describe('page audits [Y-06, Y-07, Y-09]', () => {
  const fails = async (steps: ReturnType<typeof step>[]) => {
    const r = await e.run(steps, quick);
    const last = r.steps.at(-1);
    return {
      code: last?.error?.code,
      problems: (last?.error?.details?.problems ?? []) as string[],
    };
  };

  it('a good page has no SEO, translation or layout problems', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/audit.html' }),
        step('assertSeo', {}),
        step('assertI18n', { locale: 'vi', forbidden: ['Submit'] }),
        step('assertLayout', {}),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('lists every SEO problem', async () => {
    const { code, problems } = await fails([
      step('goto', { url: '/audit.html?bad=seo' }),
      step('assertSeo', {}),
    ]);
    expect(code).toBe('ASSERTION_FAILED');
    expect(problems.join('|')).toMatch(/description/);
    expect(problems.join('|')).toMatch(/2 <h1>/);
    expect(problems.join('|')).toMatch(/without alt/);
  });

  it('finds untranslated text and wrong number/date formats', async () => {
    const { problems } = await fails([
      step('goto', { url: '/audit.html?bad=i18n' }),
      step('assertI18n', {}),
    ]);
    const all = problems.join('|');
    expect(all).toMatch(/unfilled template/);
    expect(all).toMatch(/leaked value/);
    expect(all).toMatch(/untranslated key/);
    expect(all).toMatch(/date not in dd\/MM\/yyyy/);
    expect(all).toMatch(/thousands separator/);
  });

  it('finds overflow, overlap and cut-off text, and restores the window size', async () => {
    const { problems } = await fails([
      step('goto', { url: '/audit.html?bad=layout' }),
      step('assertLayout', {}),
    ]);
    const all = problems.join('|');
    expect(all).toMatch(/375px: horizontal scroll/);
    expect(all).toMatch(/overlaps/);
    expect(all).toMatch(/text cut off/);
  });
});

describe('form behaviour [R-06, R-08, R-13]', () => {
  const sendOrder = { role: 'button', name: 'Gửi đơn' } as const;
  const tooLong = [
    step('stripClientValidation', {}),
    step('fill', { target: { css: '#code' }, value: 'DONHANG-QUA-DAI' }),
    step('click', { target: sendOrder }),
  ];

  it('a server that validates rejects what the browser would have blocked', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/server-form.html' }),
        ...tooLong,
        step('assertText', { target: { css: '#server-error' }, value: 'Mã đơn tối đa 6 ký tự' }),
        step('assertVisible', { target: { css: '#orders li' }, state: 'notExist' }),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('finds a server that trusts the browser', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/server-form.html?bug=server' }),
        ...tooLong,
        step('assertText', { target: { css: '#server-error' }, value: 'Mã đơn tối đa 6 ký tự' }),
      ],
      { request: { options: { defaultStepTimeoutMs: 1500 } } },
    );
    expect(r.steps.at(-1)?.status).toBe('failed');
  });

  it('checks the field UI, the Tab order and the leave warning', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/server-form.html' }),
        step('assertFieldUi', {
          target: { css: '#code' },
          label: 'Mã đơn',
          placeholder: 'VD: DH0001',
          required: true,
          maxLength: 6,
        }),
        step('assertFieldUi', {
          target: { css: '#note' },
          readOnly: true,
          defaultValue: 'Giao giờ hành chính',
        }),
        step('assertTabOrder', {
          fields: [{ css: '#code' }, { css: '#email' }, { css: '#note' }, { css: '#send' }],
        }),
        step('assertLeaveWarning', { expected: false }),
        step('fill', { target: { css: '#code' }, value: 'DH1' }),
        step('assertLeaveWarning', { expected: true }),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('reports every wrong UI detail, and a missing leave warning', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/server-form.html?bug=noleave' }),
        step('fill', { target: { css: '#code' }, value: 'DH1' }),
        step('assertLeaveWarning', { expected: true }),
      ],
      { request: { options: { defaultStepTimeoutMs: 1500 } } },
    );
    expect(r.steps.at(-1)?.error?.message).toContain('does not warn');
    const r2 = await e.run(
      [
        step('goto', { url: '/server-form.html' }),
        step('assertFieldUi', {
          target: { css: '#code' },
          label: 'Tên',
          placeholder: 'x',
          required: false,
        }),
      ],
      { request: { options: { defaultStepTimeoutMs: 1500 } } },
    );
    expect(r2.steps.at(-1)?.error?.details?.problems).toHaveLength(3);
  });
});

describe('site crawl and basic security [R-11, R-12]', () => {
  const login = (user: string) => [
    step('goto', { url: '/login.html' }),
    step('fill', { target: { css: '#username' }, value: user }),
    step('fill', { target: { css: '#password' }, value: '123456' }),
    step('click', { target: { role: 'button', name: 'Đăng nhập' } }),
  ];
  const long = { request: { options: { defaultStepTimeoutMs: 20000 } } };

  it('crawls a clean site without problems', async () => {
    const r = await e.run(
      [step('goto', { url: '/crawl-start.html?clean=1' }), step('crawl', { maxPages: 5 })],
      long,
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('lists the dead link, the broken image and the script error, and skips logout', async () => {
    const r = await e.run(
      [step('goto', { url: '/crawl-start.html' }), step('crawl', { maxPages: 10 })],
      long,
    );
    const err = r.steps.at(-1)?.error;
    expect(err?.code).toBe('ASSERTION_FAILED');
    const all = String(err?.details?.actual);
    expect(all).toMatch(/api\/khong-co/);
    expect(all).toMatch(/anh-hong\.png/);
    expect(all).toMatch(/Lỗi script cố ý/);
    expect(all).not.toMatch(/logout/);
  });

  it('finds the IDOR hole, the script-readable cookie and the reflected script', async () => {
    const r = await e.run(
      [
        ...login('nhanvien'),
        step('securityScan', {
          needLogin: ['/api/me'],
          otherPeople: ['/api/profile/ketoan'],
          reflect: ['/echo?q='],
        }),
      ],
      long,
    );
    const problems = (r.steps.at(-1)?.error?.details?.problems ?? []) as string[];
    const all = problems.join('|');
    expect(all).toMatch(/session_hint.*no HttpOnly/);
    expect(all).toMatch(/\/api\/profile\/ketoan shows another person/);
    expect(all).toMatch(/\/echo\?q=: the page runs a script/);
    expect(all).not.toMatch(/api\/me opens without/);
    expect(all).not.toMatch(/demo_session/);
  });

  it('passes on the safe endpoints', async () => {
    const r = await e.run(
      [
        ...login('nhanvien'),
        step('securityScan', {
          cookies: false,
          needLogin: ['/api/me'],
          otherPeople: ['/api/profile-safe/ketoan'],
          reflect: ['/echo-safe?q='],
        }),
      ],
      long,
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('refuses to run on a protected environment', async () => {
    const r = await e.run([step('goto', { url: '/login.html' }), step('securityScan', {})], {
      ...long,
      env: { type: 'production', name: 'Prod' },
    } as never);
    expect(r.steps.at(-1)?.error?.code).toBe('PROTECTED_ENVIRONMENT');
  });
});

describe('quality checks [Q-05, Q-07, Q-08, Q-10]', () => {
  const sendOrder = { role: 'button', name: 'Gửi đơn' } as const;

  it('timed: passes within the limit, fails above it', async () => {
    const ok = await e.run(
      [
        step('timed', {
          maxSeconds: 5,
          warnSeconds: 4,
          steps: [{ id: 'a', action: 'goto', params: { url: '/chat.html' } }],
        }),
      ],
      quick,
    );
    expect(bad(summary(ok))).toEqual([]);
    const slow = await e.run(
      [
        step('timed', {
          maxSeconds: 0.5,
          steps: [{ id: 'w', action: 'wait', params: { seconds: 0.8 } }],
        }),
      ],
      quick,
    );
    expect(slow.steps.at(-1)?.error?.message).toMatch(/more than the allowed 0.5 s/);
  });

  it('assertLayers names the layer that disagrees', async () => {
    const ok = await e.run([
      step('assertLayers', { ui: '99.000 ₫', api: '99000', db: '99000 ', as: 'number' }),
    ]);
    expect(bad(summary(ok))).toEqual([]);
    const r = await e.run([step('assertLayers', { ui: '99000', api: '99000', db: '95000' })]);
    expect(r.steps.at(-1)?.error?.details?.differs).toEqual(['db']);
  });

  it('three quick clicks on Save: a guarded page makes one record, an unguarded one makes three', async () => {
    const run = (guard: boolean) =>
      e.run(
        [
          step('goto', { url: `/server-form.html${guard ? '?guard=1' : ''}` }),
          step('fill', { target: { css: '#code' }, value: 'DH1' }),
          step('rapidClick', {
            target: sendOrder,
            times: 3,
            expectCount: { target: { css: '#orders li' }, count: 1 },
          }),
        ],
        { request: { options: { defaultStepTimeoutMs: 4000 } } },
      );
    expect(bad(summary(await run(true)))).toEqual([]);
    const dup = await run(false);
    expect(dup.steps.at(-1)?.error?.message).toMatch(/3 record\(s\), expected 1/);
  });

  it('buttons follow the status: an approved order has no Edit button', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/server-form.html' }),
        step('assertButtons', {
          status: 'Chờ duyệt',
          enabled: [{ css: '#btn-edit' }, { css: '#btn-approve' }],
        }),
        step('click', { target: { css: '#btn-approve' } }),
        step('assertButtons', {
          status: 'Đã duyệt',
          hidden: [{ css: '#btn-edit' }],
          disabled: [{ css: '#btn-approve' }],
        }),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
    const buggy = await e.run(
      [
        step('goto', { url: '/server-form.html?bug=edit' }),
        step('click', { target: { css: '#btn-approve' } }),
        step('assertButtons', { status: 'Đã duyệt', hidden: [{ css: '#btn-edit' }] }),
      ],
      { request: { options: { defaultStepTimeoutMs: 1500 } } },
    );
    expect(buggy.steps.at(-1)?.error?.message).toContain('should not be there');
  });
});

describe('web components with Shadow DOM [W-05]', () => {
  it('finds, fills, clicks and reads inside open shadow roots, also nested ones', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/shadow.html' }),
        step('fill', { target: { label: 'Họ tên' }, value: 'Nguyễn Văn An' }),
        step('click', { target: { role: 'button', name: 'Lưu phiếu' } }),
        step('assertText', { target: { css: '#shadow-result' }, value: 'Đã lưu Nguyễn Văn An' }),
        step('click', { target: { css: '#inner-btn' } }),
        step('assertText', { target: { css: '#shadow-result' }, value: 'Đã xác nhận (lồng)' }),
        step('fill', { target: { placeholder: 'Nhập họ tên' }, value: 'Bình' }),
        step('assertValue', { target: { css: 'kiemi-card #who' }, value: 'Bình' }),
        step('assertText', { target: { text: 'Phiếu đăng ký' }, op: 'contains', value: 'Phiếu' }),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
  });
});

describe('printing and expired sessions [W-07, W-08]', () => {
  it('"In phiếu" gives a PDF file whose text can be checked', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/print.html' }),
        step('printToFile', {
          target: { role: 'button', name: 'In phiếu' },
          into: 'phieu',
          expectText: 'Phiếu thu số 0042',
        }),
        step('printToFile', { into: 'lai', expectText: '1.250.000' }),
      ],
      { request: { options: { defaultStepTimeoutMs: 10000 } } },
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('fails when the printed page lacks the text', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/print.html' }),
        step('printToFile', { into: 'p', expectText: 'Phiếu chi' }),
      ],
      { request: { options: { defaultStepTimeoutMs: 10000 } } },
    );
    expect(r.steps.at(-1)?.error?.code).toBe('ASSERTION_FAILED');
  });

  const loginShared = {
    id: 'dang-nhap',
    name: 'Đăng nhập',
    params: ['user'],
    steps: [
      {
        id: 'l1',
        action: 'goto',
        params: { url: '/login.html' },
        session: 'default',
        enabled: true,
        mode: 'hard',
      },
      {
        id: 'l2',
        action: 'fill',
        params: { target: { css: '#username' }, value: '{{param.user}}' },
        session: 'default',
        enabled: true,
        mode: 'hard',
      },
      {
        id: 'l3',
        action: 'fill',
        params: { target: { css: '#password' }, value: '123456' },
        session: 'default',
        enabled: true,
        mode: 'hard',
      },
      {
        id: 'l4',
        action: 'click',
        params: { target: { role: 'button', name: 'Đăng nhập' } },
        session: 'default',
        enabled: true,
        mode: 'hard',
      },
    ],
  };
  const expired = (guard: boolean) => [
    step('call', { shared: 'dang-nhap', args: { user: 'nhanvien' } }),
    ...(guard
      ? [
          step('sessionGuard', {
            loginUrl: 'login.html',
            shared: 'dang-nhap',
            args: { user: 'nhanvien' },
          }),
        ]
      : []),
    step('goto', { url: '/requests.html' }),
    step('api', { method: 'POST', url: '{{app}}/api/expire' }),
    step('navigate', { to: 'reload' }),
    step('click', { target: { role: 'button', name: 'Tải lại' } }),
    step('assertText', { target: { css: 'h1' }, value: 'Danh sách đơn nghỉ' }),
  ];

  it('logs in again when the session ends in the middle of the test', async () => {
    const r = await e.run(expired(true), {
      sharedSteps: [loginShared] as never,
      request: { options: { defaultStepTimeoutMs: 12000 } },
    });
    expect(bad(summary(r))).toEqual([]);
  });

  it('without the guard the same test fails on the login page', async () => {
    const r = await e.run(expired(false), {
      sharedSteps: [loginShared] as never,
      request: { options: { defaultStepTimeoutMs: 2000 } },
    });
    expect(bad(summary(r)).length).toBeGreaterThan(0);
  });
});

describe('interactive element scan [CV-03]', () => {
  it('lists the visible buttons and fields with their boxes and a screenshot', async () => {
    const page = await e.browser.newPage();
    try {
      await page.goto(`${e.site.url}/server-form.html`);
      const scan = await scanInteractive(page);
      const names = scan.elements.map((x) => `${x.kind}:${x.name}`);
      expect(names).toContain('button:Gửi đơn');
      expect(names).toContain('button:Duyệt');
      expect(scan.elements.some((x) => x.kind === 'field' && x.id === 'code')).toBe(true);
      expect(scan.elements.every((x) => x.rect.width > 1)).toBe(true);
      expect(scan.screenshot.length).toBeGreaterThan(1000);
    } finally {
      await page.close();
    }
  });
});

describe('mock API [X-07]', () => {
  const sendOrder = { role: 'button', name: 'Gửi đơn' } as const;
  const fillAndSend = [
    step('fill', { target: { css: '#code' }, value: 'DH1' }),
    step('click', { target: sendOrder }),
  ];

  it('a faked server error shows the page error; turning the mock off lets it save', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/server-form.html' }),
        step('mockApi', { url: '/api/server-form', method: 'POST', mode: 'error', status: 503 }),
        ...fillAndSend,
        step('assertText', { target: { css: '#server-error' }, value: 'Lỗi giả lập' }),
        step('mockApi', { url: '/api/server-form', method: 'POST', mode: 'off' }),
        step('click', { target: sendOrder }),
        step('assertText', { target: { css: '#server-result' }, value: 'Đã lưu đơn' }),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('a faked empty answer and a slow one', async () => {
    const r = await e.run(
      [
        step('mockApi', {
          url: '/api/server-form',
          method: 'GET',
          mode: 'respond',
          body: { orders: ['MẪU-1'] },
        }),
        step('goto', { url: '/server-form.html' }),
        step('assertText', { target: { css: '#orders' }, value: 'MẪU-1' }),
        step('mockApi', { url: '/api/server-form', method: 'GET', mode: 'empty', delayMs: 300 }),
        step('navigate', { to: 'reload' }),
        step('assertVisible', { target: { css: '#orders li' }, state: 'notExist' }),
      ],
      quick,
    );
    expect(bad(summary(r))).toEqual([]);
  });
});

describe('e-mail box [X-06]', () => {
  /** A tiny Mailpit-like server: one mail with a code and a link. */
  async function mailbox(created: string) {
    const { createServer } = await import('node:http');
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      res.setHeader('content-type', 'application/json');
      if (url.pathname === '/api/v1/search') {
        const q = url.searchParams.get('query') ?? '';
        const mine = q.includes('an@example.com');
        res.end(
          JSON.stringify({
            messages: mine
              ? [
                  {
                    ID: 'm1',
                    Subject: 'Mã xác thực',
                    To: [{ Address: 'an@example.com' }],
                    Created: created,
                  },
                ]
              : [],
          }),
        );
      } else if (url.pathname === '/api/v1/message/m1') {
        res.end(
          JSON.stringify({
            Text: 'Mã của bạn là 482913. Xác nhận: https://app.example.com/confirm?t=abc',
            HTML: '',
          }),
        );
      } else res.end('{}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
  }

  it('takes the OTP and the link out of the newest matching mail', async () => {
    const box = await mailbox(new Date(Date.now() + 500).toISOString());
    try {
      const r = await e.run(
        [
          step('readMail', {
            url: box.url,
            to: 'an@example.com',
            regex: 'là (\\d{6})',
            into: 'otp',
          }),
          step('readMail', {
            url: box.url,
            to: 'an@example.com',
            regex: 'https?://\\S+/confirm\\S*',
            into: 'link',
          }),
          step('assertVariable', { name: 'otp', value: '482913' }),
          step('assertVariable', { name: 'link', op: 'contains', value: '/confirm?t=abc' }),
        ],
        { request: { options: { defaultStepTimeoutMs: 6000 } } },
      );
      expect(bad(summary(r))).toEqual([]);
    } finally {
      box.close();
    }
  });

  it('says clearly when the mail never comes', async () => {
    const box = await mailbox(new Date(Date.now() + 500).toISOString());
    try {
      const r = await e.run(
        [step('readMail', { url: box.url, to: 'nobody@example.com', regex: '(\\d+)', into: 'x' })],
        { request: { options: { defaultStepTimeoutMs: 2500 } } },
      );
      expect(r.steps.at(-1)?.error?.message).toMatch(/no mail to nobody@example.com/);
    } finally {
      box.close();
    }
  });
});

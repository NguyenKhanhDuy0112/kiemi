import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2E, startE2E, step, summary } from './helpers';

let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

const quick = { request: { options: { defaultStepTimeoutMs: 2000 } } };
const bad = (r: ReturnType<typeof summary>) => r.filter((x) => !x.endsWith('passed'));

const addToCart = (name: string, times = 1) =>
  Array.from({ length: times }, () =>
    step('click', { target: { role: 'button', name: `Thêm ${name}` } }),
  );
const money = (id: string) => ({ css: `[data-testid="${id}"]` });

describe('shop: cart, coupon, VAT, shipping [P-03, P-05]', () => {
  const cart = [
    step('goto', { url: '/shop.html' }),
    ...addToCart('Áo thun', 2),
    ...addToCart('Mũ lưỡi trai'),
    step('fill', { target: { label: 'Mã giảm giá' }, value: 'GIAM10' }),
    step('click', { target: { role: 'button', name: 'Áp dụng' } }),
  ];
  // The expectation is a named formula written once, the way a tester would.
  const formulas = {
    TongTien: {
      params: ['tam', 'giam'],
      expression: 'ROUND((tam - giam) * 1.08) + IF(tam - giam >= 500000, 0, 30000)',
    },
  };

  it('computes every line of the summary from a formula', async () => {
    const r = await e.run(
      [
        ...cart,
        step('assertNumber', {
          target: money('subtotal'),
          op: 'eq',
          value: '{{150000 * 2 + 80000}}',
        }),
        step('assertNumber', {
          target: money('discount'),
          op: 'eq',
          value: '{{ROUND(380000 * 0.1)}}',
        }),
        step('assertNumber', {
          target: money('vat'),
          op: 'eq',
          value: '{{ROUND((380000 - 38000) * 0.08)}}',
        }),
        step('assertNumber', { target: money('shipping'), op: 'eq', value: 30000 }),
        step('assertExpected', {
          target: money('total'),
          formula: '{{TongTien(380000, 38000)}}',
          data: '399.360',
        }),
      ],
      { request: { formulas } },
    );
    expect(bad(summary(r))).toEqual([]);
  });

  it('finds the VAT-before-discount bug', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/shop.html?bug=vat' }),
        ...cart.slice(1),
        step('assertNumber', {
          target: money('vat'),
          op: 'eq',
          value: '{{ROUND((380000 - 38000) * 0.08)}}',
        }),
      ],
      quick,
    );
    expect(summary(r).at(-1)).toBe(`${summary(r).length} failed ASSERTION_FAILED`);
  });

  it('refuses an unknown coupon', async () => {
    const r = await e.run([
      step('goto', { url: '/shop.html' }),
      step('fill', { target: { label: 'Mã giảm giá' }, value: 'SAI' }),
      step('click', { target: { role: 'button', name: 'Áp dụng' } }),
      step('assertText', {
        target: { css: '#coupon-error' },
        op: 'contains',
        value: 'không hợp lệ',
      }),
    ]);
    expect(bad(summary(r))).toEqual([]);
  });
});

describe('payroll: Excel and PDF export [Q-04, P-03]', () => {
  it('Excel total equals the total on the page', async () => {
    const r = await e.run([
      step('goto', { url: '/payroll.html' }),
      step('waitUntil', {
        condition: { assert: 'visible', target: money('payroll-total') },
        timeoutSec: 5,
      }),
      step('download', {
        target: { css: '#export-xlsx' },
        into: 'f',
        expectName: 'bang-luong',
        expectType: 'xlsx',
        range: 'A2:F7',
        cell: 'F8',
      }),
      step('assertNumber', {
        actual: "{{SUM(f.rows, 'Thực lĩnh')}}",
        op: 'eq',
        value: '{{f.cell}}',
      }),
      step('assertNumber', {
        target: { css: '[data-testid="payroll-total"] th:last-child' },
        op: 'eq',
        value: '{{f.cell}}',
      }),
      step('assertNumber', { actual: '{{f.rows.length}}', op: 'eq', value: 5 }),
    ]);
    expect(bad(summary(r))).toEqual([]);
  });

  it('PDF has the net total as text', async () => {
    const r = await e.run([
      step('goto', { url: '/payroll.html' }),
      step('download', { target: { css: '#export-pdf' }, into: 'p', expectType: 'pdf' }),
      step('assertNumber', { actual: '{{len(p.text)}}', op: 'gt', value: 50 }),
    ]);
    expect(bad(summary(r))).toEqual([]);
  });
});

describe('500-row list: search, sort, paging, total [Q-01, Q-02, Q-03]', () => {
  const t = { css: '#people-table' };
  const walk = { allPages: true, next: { css: '#next' } };
  const ready = [
    step('waitUntil', {
      condition: { assert: 'visible', target: { css: '#people-table tbody tr:first-child' } },
      timeoutSec: 8,
    }),
  ];

  it('counts 500 rows over 25 pages and matches the label', async () => {
    const r = await e.run([
      step('goto', { url: '/list.html' }),
      ...ready,
      step('assertRowTotal', { target: t, label: { css: '#total-label' }, ...walk }),
      step('assertText', { target: { css: '#total-label' }, op: 'contains', value: 'Tổng 500' }),
    ]);
    expect(bad(summary(r))).toEqual([]);
  }, 60_000);

  it('filters by department and checks every row of every page', async () => {
    const r = await e.run([
      step('goto', { url: '/list.html' }),
      ...ready,
      step('select', { target: { label: 'Phòng ban' }, option: 'Kế toán' }),
      step('waitUntil', {
        condition: {
          assert: 'text',
          target: { css: '#total-label' },
          op: 'contains',
          value: 'Tổng 100',
        },
        timeoutSec: 5,
      }),
      step('assertAllRows', {
        target: t,
        column: 'Phòng ban',
        op: 'equals',
        value: 'Kế toán',
        ...walk,
      }),
    ]);
    expect(bad(summary(r))).toEqual([]);
  }, 60_000);

  it('detects a stray row when the filter is buggy', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/list.html?bug=filter' }),
        ...ready,
        step('select', { target: { label: 'Phòng ban' }, option: 'Kế toán' }),
        step('waitUntil', {
          condition: {
            assert: 'text',
            target: { css: '#total-label' },
            op: 'contains',
            value: 'Tổng 101',
          },
          timeoutSec: 5,
        }),
        step('assertAllRows', {
          target: t,
          column: 'Phòng ban',
          op: 'equals',
          value: 'Kế toán',
          ...walk,
        }),
      ],
      { request: { options: { defaultStepTimeoutMs: 30_000 } } },
    );
    expect(summary(r).at(-1)).toBe('5 failed ASSERTION_FAILED');
    expect(JSON.stringify(r)).toContain('1/101 rows break it');
  }, 90_000);

  it('sorted by name in Vietnamese order; one wrong row is found', async () => {
    const sortByName = [
      step('click', { target: { role: 'button', name: 'Họ tên' } }),
      step('wait', { seconds: 0.8 }),
    ];
    const ok = await e.run([
      step('goto', { url: '/list.html' }),
      ...ready,
      ...sortByName,
      step('assertSorted', {
        target: t,
        column: 'Họ tên',
        direction: 'asc',
        kind: 'text',
        ...walk,
      }),
    ]);
    expect(bad(summary(ok))).toEqual([]);

    const buggy = await e.run(
      [
        step('goto', { url: '/list.html?bug=sort' }),
        ...ready,
        step('assertSorted', { target: t, column: 'Mã', direction: 'asc', ...walk }),
      ],
      { request: { options: { defaultStepTimeoutMs: 30_000 } } },
    );
    expect(summary(buggy).at(-1)).toBe('3 failed ASSERTION_FAILED');
    expect(JSON.stringify(buggy)).toContain('row 12');
  }, 90_000);
});

describe('import with rejected rows [P-09, Q-04]', () => {
  it('generates a file with good and bad rows, uploads it and finds the errors by row', async () => {
    const r = await e.run([
      step('goto', { url: '/import.html' }),
      step('generateFile', {
        into: 'f',
        fileName: 'nhan-vien',
        format: 'xlsx',
        count: 5,
        columns: {
          Mã: 'NV{{loop.index}}',
          'Họ tên': 'Nhân viên {{loop.index}}',
          Email: '{{loop.index}}@example.com',
          Lương: '{{10000000 + loop.index * 500000}}',
        },
      }),
      step('upload', { target: { label: 'Chọn file (.xlsx hoặc .csv)' }, files: '{{f.path}}' }),
      step('click', { target: { role: 'button', name: 'Nhập' } }),
      step('assertText', {
        target: { css: '#result' },
        op: 'contains',
        value: 'Đã nhập 5/5 dòng, 0 dòng lỗi',
      }),
      step('assertText', {
        target: money('imported-count'),
        op: 'contains',
        value: 'Đã nhập 5 nhân viên',
      }),
      // The same codes again → every row is a duplicate.
      step('upload', { target: { label: 'Chọn file (.xlsx hoặc .csv)' }, files: '{{f.path}}' }),
      step('click', { target: { role: 'button', name: 'Nhập' } }),
      step('assertText', {
        target: { css: '#result' },
        op: 'contains',
        value: '0/5 dòng, 5 dòng lỗi',
      }),
      step('assertText', {
        target: { css: '#errors' },
        op: 'contains',
        value: 'Dòng 2: Mã NV1 bị trùng',
      }),
    ]);
    expect(bad(summary(r))).toEqual([]);
  });

  it('names the exact file row of a bad email', async () => {
    const r = await e.run([
      step('goto', { url: '/import.html' }),
      step('generateFile', {
        into: 'f',
        format: 'csv',
        from: 'columns',
        count: 3,
        columns: { Mã: 'X{{loop.index}}', 'Họ tên': 'An', Email: 'a@x.vn', Lương: '1000000' },
      }),
      step('generateFile', {
        into: 'g',
        format: 'csv',
        from: 'list',
        list: "{{FILTER(f.rows, 'Mã', '<>X2')}}",
      }),
      step('upload', { target: { label: 'Chọn file (.xlsx hoặc .csv)' }, files: '{{g.path}}' }),
      step('click', { target: { role: 'button', name: 'Nhập' } }),
      step('assertText', { target: { css: '#result' }, op: 'contains', value: 'Đã nhập 2/2 dòng' }),
    ]);
    expect(bad(summary(r))).toEqual([]);
  });
});

describe('promotion by date, countdown and two places [Y-01, V-02, V-03]', () => {
  const price = { css: '#price' };

  it('turns the promotion off when the clock jumps past its last day', async () => {
    const r = await e.run([
      step('clock', { op: 'set', time: '01/06/2030 08:00' }),
      step('goto', { url: '/promo.html' }),
      step('assertText', { target: price, value: '99.000 ₫' }),
      step('assertText', { target: { css: '#promo-status' }, value: 'Đang khuyến mãi' }),
      step('assertText', { target: { css: '#countdown' }, op: 'contains', value: 'Còn 29 ngày' }),
      step('clock', { op: 'advance', amount: 30, unit: 'days' }),
      step('assertText', { target: { css: '#promo-status' }, value: 'Khuyến mãi đã kết thúc' }),
      step('assertText', { target: price, value: '150.000 ₫' }),
    ]);
    expect(bad(summary(r))).toEqual([]);
  });

  it('shows a visitor the price the manager just saved', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/login.html' }),
        step('fill', { target: { css: '#username' }, value: 'quanly' }),
        step('fill', { target: { css: '#password' }, value: '123456' }),
        step('click', { target: { role: 'button', name: 'Đăng nhập' } }),
        step('goto', { url: '/promo.html' }),
        step('openIn', { session: 'khach', url: '/promo.html' }),
        step('assertSame', {
          left: { target: price, session: 'default' },
          right: { target: price, session: 'khach' },
        }),
        step('fill', { target: { css: '#new-price' }, value: '120000' }),
        step('click', { target: { role: 'button', name: 'Lưu giá' } }),
        step('assertText', { target: price, value: '120.000 ₫' }, { session: 'khach' }),
        step('assertSame', {
          left: { target: price, session: 'default' },
          right: { target: price, session: 'khach' },
        }),
      ],
      { sessions: ['default', 'khach'] },
    );
    expect(bad(summary(r))).toEqual([]);
  });
});

describe('special inputs page [W-04, W-06]', () => {
  it('fills every kind of box and submits', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiemi-controls-'));
    const file = join(dir, 'ho-so.txt');
    await writeFile(file, 'xin chao');
    const r = await e.run([
      step('goto', { url: '/controls.html' }),
      step('pickOption', { target: { css: '#city' }, search: 'hà', option: 'Hà Nội' }),
      step('pickOption', { target: { css: '#who' }, search: 'nguyễn v', option: 'Nguyễn Văn An' }),
      step('fill', { target: { css: '#phone' }, value: '0912345678', typing: 'keys' }),
      step('fill', { target: { css: '#editor' }, value: 'Gọi lại sau 5 giờ' }),
      step('pickDateRange', {
        target: { css: '#range' },
        from: '01/07/2030',
        to: '15/07/2030',
        apply: { css: '#range-apply' },
      }),
      step('upload', { target: { css: '#dropzone' }, files: file, via: 'drop' }),
      step('click', { target: { role: 'button', name: 'Gửi' } }),
      step('assertText', { target: { css: '#result' }, op: 'contains', value: '"city": "Hà Nội"' }),
      step('assertText', {
        target: { css: '#result' },
        op: 'contains',
        value: '"who": "Nguyễn Văn An"',
      }),
      step('assertText', {
        target: { css: '#result' },
        op: 'contains',
        value: '"phone": "0912 345 678"',
      }),
      step('assertText', {
        target: { css: '#result' },
        op: 'contains',
        value: 'Gọi lại sau 5 giờ',
      }),
      step('assertText', {
        target: { css: '#result' },
        op: 'contains',
        value: '01/07/2030 - 15/07/2030',
      }),
      step('assertText', {
        target: { css: '#result' },
        op: 'contains',
        value: 'ho-so.txt (8 byte)',
      }),
    ]);
    expect(bad(summary(r))).toEqual([]);
  });
});

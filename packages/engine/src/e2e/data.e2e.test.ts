import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('lists & objects [P-02]', () => {
  it('saves one page of a table as a list of objects', async () => {
    const r = await e.run([
      step('goto', { url: '/table.html' }),
      step('waitUntil', {
        condition: { assert: 'visible', target: { css: '#products-table tbody tr:first-child' } },
        timeoutSec: 5,
      }),
      step('extractTable', { target: { css: '#products-table' }, into: 'sp' }),
      step('assertNumber', { actual: '{{sp.length}}', op: 'eq', value: 10 }),
      step('assertNumber', { actual: '{{sp[0]["Tồn kho"]}}', op: 'gte', value: 0 }),
      step('assertNumber', { actual: '{{sp[1]["Tồn kho"]}}', op: 'gte', value: 0 }),
    ]);
    expect(summary(r)).toEqual([
      '1 passed',
      '2 passed',
      '3 passed',
      '4 passed',
      '5 passed',
      '6 passed',
    ]);
  });

  it('walks every page when asked', async () => {
    const r = await e.run([
      step('goto', { url: '/table.html' }),
      step('waitUntil', {
        condition: { assert: 'visible', target: { css: '#products-table tbody tr:first-child' } },
        timeoutSec: 5,
      }),
      step('extractTable', {
        target: { css: '#products-table' },
        into: 'sp',
        allPages: true,
        next: { css: '#next' },
      }),
      step('assertNumber', { actual: '{{sp.length}}', op: 'eq', value: 47 }),
      step('assertNumber', { actual: '{{sp[46]["Tồn kho"]}}', op: 'gte', value: 0 }),
    ]);
    expect(summary(r)).toEqual(['1 passed', '2 passed', '3 passed', '4 passed', '5 passed']);
  });
});

describe('nested datasets [P-01]', () => {
  const dataset = {
    id: 'ds',
    name: 'Bộ',
    columns: ['maBo'],
    rows: [{ maBo: 'B1' }, { maBo: 'B2' }],
    children: [
      {
        name: 'SanPham',
        key: 'maBo',
        parentKey: 'maBo',
        columns: ['maSp', 'maBo'],
        rows: [
          { maSp: 'S1', maBo: 'B1' },
          { maSp: 'S2', maBo: 'B1' },
          { maSp: 'S3', maBo: 'B2' },
        ],
      },
    ],
  };
  const steps = [
    step('loop', {
      over: 'children',
      child: 'SanPham',
      steps: [
        {
          id: 'a',
          action: 'assertNumber',
          params: { actual: '{{loop.index}}', op: 'lte', value: 2 },
        },
        { id: 'b', action: 'extract', params: { from: 'title', into: 'x' } },
      ],
    }),
  ];

  it('runs the children of the current row only', async () => {
    const events: EngineEvent[] = [];
    const r1 = await e.run(steps, { events, request: { dataset, rowIndex: 0 } });
    expect(
      events.filter(
        (x) =>
          x.type === 'log' && /Loop: 2 iteration/.test(String((x as { message?: string }).message)),
      ).length,
    ).toBe(1);
    expect(r1.status).toBe('passed');
    const events2: EngineEvent[] = [];
    await e.run(steps, { events: events2, request: { dataset, rowIndex: 1 } });
    expect(JSON.stringify(events2)).toContain('Loop: 1 iteration');
  });

  it('fails clearly when the child table does not exist', async () => {
    const r = await e.run(
      [
        step('loop', {
          over: 'children',
          child: 'Nope',
          steps: [{ id: 'z', action: 'wait', params: { seconds: 0 } }],
        }),
      ],
      {
        request: { dataset, rowIndex: 0 },
      },
    );
    expect(summary(r)).toEqual(['1 failed INVALID_PARAMS']);
  });
});

describe('project formulas in a run [P-03]', () => {
  it('uses named formulas inside {{ }} of any step', async () => {
    const r = await e.run(
      [
        step('goto', { url: '/table.html' }),
        step('waitUntil', {
          condition: { assert: 'visible', target: { css: '#products-table tbody tr:first-child' } },
          timeoutSec: 5,
        }),
        step('extractTable', { target: { css: '#products-table' }, into: 'sp' }),
        step('assertNumber', {
          actual: "{{Tong(sp, 'Tồn kho')}}",
          op: 'gte',
          value: "{{Tong(sp, 'Tồn kho') - 1}}",
        }),
      ],
      {
        request: {
          formulas: { Tong: { params: ['ds', 'cot'], expression: 'SUM(ds, cot)' } },
        },
      },
    );
    expect(summary(r)).toEqual(['1 passed', '2 passed', '3 passed', '4 passed']);
  });
});

describe('number tolerance and locale [P-04, P-10]', () => {
  it('passes within the allowed gap and shows the difference when outside', async () => {
    const r = await e.run(
      [
        step('assertNumber', { actual: '333.396', op: 'eq', value: '333.400', tolerance: 100 }),
        step('assertNumber', { actual: '1.250.000 ₫', op: 'eq', value: 1250000 }),
        step('assertNumber', { actual: '1.000', op: 'eq', value: 1030, tolerancePercent: 5 }),
        step('assertNumber', { actual: '1.250', op: 'eq', value: 1250 }),
        step('assertNumber', { actual: '1.000', op: 'eq', value: 1100, tolerancePercent: 5 }),
      ],
      { request: { options: { defaultStepTimeoutMs: 1000 } } },
    );
    expect(summary(r)).toEqual([
      '1 passed',
      '2 passed',
      '3 passed',
      '4 passed',
      '5 failed ASSERTION_FAILED',
    ]);
    const failed = JSON.stringify(r);
    expect(failed).toContain('1100 ± 55');
    expect(failed).toContain('1000 (chênh -100)');
  });

  it('reads "1.250" as 1.25 when the environment is English', async () => {
    const r = await e.run([step('assertNumber', { actual: '1.250', op: 'eq', value: 1.25 })], {
      request: {
        env: {
          id: 'en',
          name: 'EN',
          baseUrl: e.site.url,
          variables: {},
          secretNames: [],
          apps: {},
          type: 'other',
          protected: false,
          locale: 'en',
        },
      },
    });
    expect(summary(r)).toEqual(['1 passed']);
  });
});

describe('table vs expected list and two-source expectation [P-05, P-06, Q-03]', () => {
  const open = [
    step('goto', { url: '/table.html' }),
    step('waitUntil', {
      condition: { assert: 'visible', target: { css: '#products-table tbody tr:first-child' } },
      timeoutSec: 5,
    }),
  ];
  const all = step('extractTable', {
    target: { css: '#products-table' },
    into: 'all',
    allPages: true,
    next: { css: '#next' },
  });

  it('matches every page against the list read before, ignoring order', async () => {
    const r = await e.run([
      ...open,
      all,
      ...open, // back to page 1 (the walk above ended on the last page)
      step('assertTableCompare', {
        target: { css: '#products-table' },
        expected: '{{all}}',
        key: 'Mã',
        columns: ['Tên sản phẩm', 'Giá'],
        allPages: true,
        next: { css: '#next' },
      }),
    ]);
    expect(summary(r)).toEqual([
      '1 passed',
      '2 passed',
      '3 passed',
      '4 passed',
      '5 passed',
      '6 passed',
    ]);
  });

  it('reports missing rows with the structured diff', async () => {
    const r = await e.run(
      [
        ...open,
        all,
        step('assertTableCompare', {
          target: { css: '#products-table' },
          expected: '{{all}}',
          key: 'Mã',
        }),
      ],
      { request: { options: { defaultStepTimeoutMs: 2000 } } },
    );
    expect(summary(r)).toEqual(['1 passed', '2 passed', '3 passed', '4 failed ASSERTION_FAILED']);
    const text = JSON.stringify(r);
    expect(text).toContain('thiếu 40'); // the walk left the table on its last page (7 rows)
    expect(text).toContain('"missing"');
  });

  it('warns when the Excel expectation differs from the formula, and still checks the Excel value', async () => {
    const events: EngineEvent[] = [];
    const r = await e.run(
      [
        step('assertExpected', {
          actual: '1.250.000 ₫',
          data: '1250000',
          formula: '{{1000000 + 250000}}',
        }),
        step('assertExpected', {
          actual: '1.250.000 ₫',
          data: '1200000',
          formula: '{{1000000 + 250000}}',
        }),
      ],
      { events, request: { options: { defaultStepTimeoutMs: 1000 } } },
    );
    expect(summary(r)).toEqual(['1 passed', '2 failed ASSERTION_FAILED']);
    const warns = events.filter((x) =>
      JSON.stringify(x).includes('Kỳ vọng trong Excel khác công thức'),
    );
    expect(warns.length).toBeGreaterThan(0);
    expect(warns.length).toBe(warns.filter((x) => JSON.stringify(x).includes('1200000')).length);
  });
});

describe('table rules [Q-01, Q-02, Q-03]', () => {
  const open = [
    step('goto', { url: '/table.html' }),
    step('waitUntil', {
      condition: { assert: 'visible', target: { css: '#products-table tbody tr:first-child' } },
      timeoutSec: 5,
    }),
  ];
  const t = { css: '#products-table' };
  const walk = { allPages: true, next: { css: '#next' } };
  const quick = { request: { options: { defaultStepTimeoutMs: 1500 } } };

  it('walks every page for rows, order and the total', async () => {
    const r = await e.run([
      ...open,
      step('assertAllRows', { target: t, column: 'Tồn kho', op: 'gte', value: 0, ...walk }),
      ...open,
      step('assertSorted', { target: t, column: 'Mã', direction: 'asc', ...walk }),
      ...open,
      step('assertRowTotal', { target: t, value: 47, ...walk }),
    ]);
    expect(summary(r).filter((x) => !x.endsWith('passed'))).toEqual([]);
  });

  it('names the rows that break a condition or the order', async () => {
    const r = await e.run(
      [
        ...open,
        step('assertAllRows', {
          target: t,
          column: 'Nhóm',
          op: 'equals',
          value: 'Không có nhóm này',
        }),
        step('assertSorted', { target: t, column: 'Tồn kho', direction: 'asc' }, { mode: 'soft' }),
        step('assertRowTotal', { target: t, value: 11 }, { mode: 'soft' }),
      ],
      quick,
    );
    const s = summary(r);
    expect(s[2]).toBe('3 failed ASSERTION_FAILED');
    expect(JSON.stringify(r)).toContain('10/10 rows break it');
  });

  it('reads the total from a label such as "Tổng 3 bản ghi"', async () => {
    const html = encodeURIComponent(
      '<p id="t">Tổng 3 bản ghi</p><table id="x"><tr><th>Tên</th></tr><tr><td>An</td></tr><tr><td>Ăn</td></tr><tr><td>Bình</td></tr></table>',
    );
    const r = await e.run([
      step('goto', { url: `data:text/html;charset=utf-8,${html}` }),
      step('assertRowTotal', { target: { css: '#x' }, label: { css: '#t' } }),
      step('assertSorted', { target: { css: '#x' }, column: 'Tên', kind: 'text' }),
    ]);
    expect(summary(r)).toEqual(['1 passed', '2 passed', '3 passed']);
  });
});

describe('generate files to upload [P-09]', () => {
  const uploadPage = encodeURIComponent(
    '<input type="file" id="f" aria-label="Chọn file"><p id="out"></p><script>f.onchange=()=>{const x=f.files[0];out.textContent=x.name+" "+x.size}</script>',
  );
  const open = step('goto', { url: `data:text/html;charset=utf-8,${uploadPage}` });

  it('makes a 200-row Excel with fresh random values, then uploads it', async () => {
    const r = await e.run([
      step('generateFile', {
        into: 'f',
        fileName: 'nhan-vien',
        format: 'xlsx',
        count: 200,
        columns: {
          STT: '{{loop.index}}',
          Email: '{{randomString(8)}}@example.com',
          Mã: 'NV{{random}}',
        },
      }),
      step('assertNumber', { actual: '{{f.count}}', op: 'eq', value: 200 }),
      step('assertNumber', { actual: '{{f.rows[199].STT}}', op: 'eq', value: 200 }),
      step('assertNumber', { actual: "{{COUNTIF(f.rows, 'Email', '<>')}}", op: 'eq', value: 200 }),
      open,
      step('upload', { target: { label: 'Chọn file' }, files: '{{f.path}}' }),
      step('assertText', { target: { css: '#out' }, op: 'contains', value: 'nhan-vien.xlsx' }),
    ]);
    expect(summary(r).filter((x) => !x.endsWith('passed'))).toEqual([]);
  });

  it('writes CSV from a list variable, and from the test data', async () => {
    const dataset = {
      id: 'd',
      name: 'D',
      columns: ['maBo'],
      rows: [{ maBo: 'B1' }],
      children: [
        {
          name: 'SanPham',
          key: 'maBo',
          parentKey: 'maBo',
          columns: ['maSp', 'maBo'],
          rows: [
            { maSp: 'S1', maBo: 'B1' },
            { maSp: 'S2', maBo: 'B1' },
          ],
        },
      ],
    };
    const r = await e.run(
      [
        step('generateFile', {
          into: 'c',
          format: 'csv',
          from: 'list',
          list: '{{children.SanPham}}',
        }),
        step('assertNumber', { actual: '{{c.count}}', op: 'eq', value: 2 }),
        step('generateFile', { into: 'd', format: 'csv', from: 'data' }),
        step('assertNumber', { actual: '{{d.count}}', op: 'eq', value: 1 }),
        step(
          'generateFile',
          { into: 'x', from: 'columns', columns: { a: '1' }, template: 'khong-co.xlsx' },
          { mode: 'soft' },
        ),
      ],
      { request: { dataset, rowIndex: 0 } },
    );
    expect(summary(r)).toEqual([
      '1 passed',
      '2 passed',
      '3 passed',
      '4 passed',
      '5 failed FILE_NOT_FOUND',
    ]);
  });
});

describe('compare two places in one step [V-03]', () => {
  const page = (body: string) => `data:text/html;charset=utf-8,${encodeURIComponent(body)}`;
  const table = (rows: string[][]) =>
    `<table id="t"><tr><th>Mã</th><th>Giá</th></tr>${rows
      .map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`)
      .join('')}</table>`;
  const left = (css: string) => ({ target: { css }, tab: 'main' });
  const right = (css: string) => ({ target: { css }, tab: 'admin' });

  it('compares text, numbers with tolerance and tables across two tabs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiemi-v03-'));
    const r = await e.run(
      [
        step('goto', {
          url: page(
            `<p id="p">1.250.000 ₫</p>${table([
              ['A', '10'],
              ['B', '20'],
            ])}`,
          ),
        }),
        step('newTab', {
          url: page(
            `<p id="p">1250000</p>${table([
              ['B', '20'],
              ['A', '11'],
            ])}`,
          ),
          name: 'admin',
        }),
        step('switchTab', { by: 'index', value: 1 }),
        step('assertSame', { left: left('#p'), right: right('#p'), as: 'number' }),
        step(
          'assertSame',
          { left: left('#p'), right: right('#p') },
          { mode: 'soft', timeoutMs: 800 },
        ),
        step(
          'assertSame',
          {
            left: left('#t'),
            right: right('#t'),
            as: 'table',
            key: 'Mã',
          },
          { mode: 'soft', timeoutMs: 800 },
        ),
      ],
      { request: { options: { artifacts: { dir, screenshots: 'onFailure' } } } },
    );
    expect(summary(r)).toEqual([
      '1 passed',
      '2 passed',
      '3 passed',
      '4 passed',
      '5 failed ASSERTION_FAILED',
      '6 failed ASSERTION_FAILED',
    ]);
    // Both tabs are shown when they differ.
    expect(r.steps[4]?.artifacts.map((a) => a.path)).toEqual([
      'step-5-failed-1.png',
      'step-5-failed-2.png',
    ]);
    expect(JSON.stringify(r.steps[5]?.error)).toContain('mismatched');
  });
});

describe('fake time [Y-01]', () => {
  const page = (body: string) => `data:text/html;charset=utf-8,${encodeURIComponent(body)}`;
  const shows = page(
    '<p id="d"></p><script>d.textContent=new Date().toISOString().slice(0,16)</script>',
  );
  const read = (name: string) => step('extract', { target: { css: '#d' }, into: name });

  it('sets, freezes, advances and resumes the browser clock', async () => {
    const r = await e.run([
      step('clock', { op: 'set', time: '15/03/2030 08:00' }),
      step('goto', { url: shows }),
      read('t1'),
      step('assertVariable', { name: 't1', op: 'startsWith', value: '2030-03-1' }),
      step('clock', { op: 'advance', amount: 2, unit: 'days' }),
      step('goto', { url: shows }),
      read('t2'),
      step('assertVariable', { name: 't2', op: 'startsWith', value: '2030-03-17' }),
      step('clock', { op: 'freeze', time: '01/01/2031 12:00' }),
      step('goto', { url: shows }),
      read('t3'),
      step('assertVariable', { name: 't3', op: 'startsWith', value: '2031-01-01' }),
      step('clock', { op: 'set', time: 'không phải ngày' }, { mode: 'soft' }),
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
      '11 passed',
      '12 passed',
      '13 failed INVALID_PARAMS',
    ]);
  });
});

describe('virtual-scroll grid [W-03]', () => {
  const grid = { css: '#grid' };
  const open = [
    step('goto', { url: '/grid.html' }),
    step('waitUntil', {
      condition: { assert: 'visible', target: { css: '#viewport [aria-rowindex="2"]' } },
      timeoutSec: 5,
    }),
  ];

  it('reads every row of a grid that only draws what is in view', async () => {
    const r = await e.run(
      [
        ...open,
        // Without `virtual` only the rows in the window are in the page.
        step('extractTable', { target: grid, into: 'few' }),
        step('assertNumber', { actual: '{{few.length}}', op: 'lt', value: 50 }),
        step('extractTable', { target: grid, into: 'all', virtual: true }),
        step('assertNumber', { actual: '{{all.length}}', op: 'eq', value: 1000 }),
        step('assertNumber', { actual: '{{all[0]["Số lượng"]}}', op: 'eq', value: 0 }),
        step('assertNumber', { actual: '{{all[999]["Số lượng"]}}', op: 'eq', value: 43 }),
        step('assertNumber', { actual: '{{all[776]["Số lượng"]}}', op: 'eq', value: 32 }),
        step('assertAllRows', {
          target: grid,
          virtual: true,
          column: 'Số lượng',
          op: 'lt',
          value: 50,
        }),
        step('assertSorted', {
          target: grid,
          virtual: true,
          column: 'Mã',
          direction: 'asc',
          kind: 'text',
        }),
        step('assertTable', {
          target: grid,
          virtual: true,
          where: { column: 'Mã', value: 'SP0777' },
          column: 'Đơn giá',
          value: '7.000',
        }),
        step(
          'assertTable',
          {
            target: grid,
            virtual: true,
            where: { column: 'Mã', value: 'SP0777' },
            column: 'Đơn giá',
            value: '9.999',
          },
          { mode: 'soft', timeoutMs: 15_000 },
        ),
      ],
      { request: { options: { defaultStepTimeoutMs: 30_000 } } },
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
      '10 passed',
      '11 passed',
      '12 passed',
      '13 failed ASSERTION_FAILED',
    ]);
  });
});

describe('grid rows and header filters [W-03]', () => {
  const grid = { css: '#grid' };
  const open = [
    step('goto', { url: '/grid.html' }),
    step('waitUntil', {
      condition: { assert: 'visible', target: { css: '#viewport [aria-rowindex="2"]' } },
      timeoutSec: 5,
    }),
  ];
  const where = (value: string) => ({ column: 'Mã', value });

  it('ticks, opens, edits rows far below the first screen and filters by header', async () => {
    const r = await e.run(
      [
        ...open,
        step('gridRow', { target: grid, where: where('SP0777'), do: 'select' }),
        step('assertText', { target: { css: '#selected-count' }, value: '1' }),
        step('gridRow', { target: grid, where: where('SP0777'), do: 'unselect' }),
        step('assertText', { target: { css: '#selected-count' }, value: '0' }),
        step('gridRow', { target: grid, where: where('SP0900'), do: 'expand' }),
        step('assertText', { target: { css: '#grid' }, op: 'contains', value: 'Chi tiết SP0900' }),
        step('gridRow', {
          target: grid,
          where: where('SP0500'),
          do: 'edit',
          column: 'Số lượng',
          value: '99',
        }),
        step('assertTable', {
          target: grid,
          virtual: true,
          where: where('SP0500'),
          column: 'Số lượng',
          value: '99',
        }),
        step('gridFilter', { target: grid, column: 'Mã', value: 'SP0123' }),
        step('assertText', { target: { css: '#shown-count' }, value: '1' }),
        step('gridFilter', { target: grid, column: 'Mã', value: '' }),
        step('gridFilter', { target: grid, column: 'Tên', value: 'kéo' }),
        step('assertText', { target: { css: '#shown-count' }, value: '125' }),
        step(
          'gridRow',
          { target: grid, where: where('SP9999'), do: 'select' },
          { mode: 'soft', timeoutMs: 20_000 },
        ),
        step('gridFilter', { target: grid, column: 'Giá không có', value: 'x' }, { mode: 'soft' }),
      ],
      { request: { options: { defaultStepTimeoutMs: 30_000 } } },
    );
    const sm = summary(r);
    expect(sm.slice(0, 15)).toEqual(Array.from({ length: 15 }, (_, i) => `${i + 1} passed`));
    expect(sm.slice(15)).toEqual(['16 failed ELEMENT_NOT_FOUND', '17 failed INVALID_PARAMS']);
  });
});

describe('complex controls [W-04]', () => {
  const page = (body: string) => `data:text/html;charset=utf-8,${encodeURIComponent(body)}`;
  const controls = page(`
    <div id="city" tabindex="0" role="combobox" aria-label="Thành phố">Chọn…</div>
    <div id="box" hidden><input id="q" aria-label="Tìm"><ul id="list"></ul></div>
    <script>
      const cities = ['Hà Nội', 'Hải Phòng', 'Đà Nẵng', 'Hà Nội 2'];
      const draw = (f) => list.innerHTML = cities.filter(c => c.toLowerCase().includes(f.toLowerCase())).map(c => '<li role="option">' + c + '</li>').join('');
      city.onclick = () => { box.hidden = false; draw(''); q.focus(); };
      q.oninput = () => draw(q.value);
      list.onclick = (e) => { city.textContent = e.target.textContent; box.hidden = true; };
    </script>
    <input id="phone" aria-label="Điện thoại" placeholder="0000 000 000">
    <script>
      phone.addEventListener('keydown', (e) => {
        if (e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault();
      });
      phone.addEventListener('input', () => {
        const d = phone.value.replace(/\\D/g, '').slice(0, 10);
        phone.value = d.replace(/^(\\d{4})(\\d{0,3})(\\d{0,3}).*/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '));
      });
    </script>
    <div id="editor" contenteditable="true" aria-label="Nội dung" style="border:1px solid #999;min-height:40px"></div>
    <input id="range" aria-label="Khoảng ngày">
    <button id="apply" onclick="applied.textContent = 'ok:' + range.value">Áp dụng</button><p id="applied"></p>
  `);

  it('chooses in a searchable list, types masked and rich text, and picks a date range', async () => {
    const r = await e.run([
      step('goto', { url: controls }),
      step('pickOption', { target: { css: '#city' }, search: 'hà', option: 'Hà Nội' }),
      step('assertText', { target: { css: '#city' }, value: 'Hà Nội' }),
      step('pickOption', { target: { css: '#city' }, option: 'Đà Nẵng' }),
      step('assertText', { target: { css: '#city' }, value: 'Đà Nẵng' }),
      step(
        'pickOption',
        { target: { css: '#city' }, option: 'Huế' },
        { mode: 'soft', timeoutMs: 1500 },
      ),
      step('fill', { target: { css: '#phone' }, value: '0912345678', typing: 'keys' }),
      step('assertValue', { target: { css: '#phone' }, value: '0912 345 678' }),
      step('fill', { target: { css: '#editor' }, value: 'Xin chào các bạn' }),
      step('assertText', { target: { css: '#editor' }, value: 'Xin chào các bạn' }),
      step('fill', { target: { css: '#editor' }, value: '!', clear: false, typing: 'keys' }),
      step('assertText', { target: { css: '#editor' }, value: 'Xin chào các bạn!' }),
      step('pickDateRange', {
        target: { css: '#range' },
        from: '05/03/2030',
        to: '09/03/2030',
        apply: { css: '#apply' },
      }),
      step('assertText', { target: { css: '#applied' }, value: 'ok:05/03/2030 - 09/03/2030' }),
      step(
        'pickDateRange',
        { target: { css: '#range' }, from: '09/03/2030', to: '05/03/2030' },
        { mode: 'soft' },
      ),
    ]);
    const sm = summary(r);
    expect(sm.slice(0, 5)).toEqual(Array.from({ length: 5 }, (_, i) => `${i + 1} passed`));
    expect(sm[5]).toBe('6 failed ELEMENT_NOT_FOUND');
    expect(sm.slice(6, 14)).toEqual(Array.from({ length: 8 }, (_, i) => `${i + 7} passed`));
    expect(sm[14]).toBe('15 failed INVALID_PARAMS');
  });
});

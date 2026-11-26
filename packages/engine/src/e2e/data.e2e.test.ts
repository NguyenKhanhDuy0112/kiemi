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

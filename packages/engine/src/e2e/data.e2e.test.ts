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

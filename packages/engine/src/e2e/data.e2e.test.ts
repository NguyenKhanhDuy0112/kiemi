import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

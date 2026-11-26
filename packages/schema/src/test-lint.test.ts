import { describe, expect, it } from 'vitest';
import { TestCaseSchema } from './test-case';
import { isWeakStrategy, lintTest, removeStep, signatureOf } from './test-lint';

const ID = '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f10';
const tc = (steps: unknown[], extra: Record<string, unknown> = {}) =>
  TestCaseSchema.parse({ schemaVersion: 2, id: ID, name: 'T', steps, ...extra });
const css = (value: string) => ({ strategies: [{ kind: 'css', value }] });

describe('lintTest [CV-07]', () => {
  it('has nothing to say about an empty test or a healthy one', () => {
    expect(lintTest(tc([]))).toEqual([]);
    const ok = tc(
      [
        { id: 's1', action: 'goto', params: { url: '{{app}}/' } },
        { id: 's2', action: 'click', params: { target: css('#save') } },
        { id: 's3', action: 'assertToast', params: { text: 'Đã lưu' } },
      ],
      { cleanup: [] },
    );
    expect(lintTest(ok)).toEqual([]);
  });

  it('warns about no check, fixed waits (with a fix), weak selectors and long tests', () => {
    const steps = [
      { id: 'w', action: 'wait', params: { seconds: 5 } },
      { id: 'c', action: 'click', params: { target: css('div > div > ul > li:nth-child(3) > a') } },
      ...Array.from({ length: 45 }, (_, i) => ({
        id: `g${i}`,
        action: 'goto',
        params: { url: `/${i}` },
      })),
    ];
    const w = lintTest(tc(steps));
    const rules = w.map((x) => x.rule);
    expect(rules).toEqual(
      expect.arrayContaining(['noAssertion', 'fixedWait', 'weakSelector', 'tooLong']),
    );
    expect(w.find((x) => x.rule === 'fixedWait')?.fix).toEqual({ kind: 'removeStep', stepId: 'w' });
    expect(w.find((x) => x.rule === 'tooLong')?.params).toEqual({ count: 47, max: 40 });
  });

  it('flags data written without cleanup, hard-coded data and duplicates', () => {
    const steps = [
      { id: 'f', action: 'fill', params: { target: css('#e'), value: 'a@b.vn' } },
      { id: 'a', action: 'assertToast', params: { text: 'ok' } },
    ];
    const a = tc(steps);
    const w = lintTest(a, { other: signatureOf(a) });
    expect(w.map((x) => x.rule)).toEqual(
      expect.arrayContaining(['noCleanup', 'hardCodedData', 'duplicate']),
    );
    expect(lintTest(a, { [ID]: signatureOf(a) }).some((x) => x.rule === 'duplicate')).toBe(false);
    expect(
      lintTest(tc(steps, { tags: ['form-validation', 'negative'] })).map((x) => x.rule),
    ).toEqual([]);
    const withVar = tc(
      [
        { id: 'f', action: 'fill', params: { target: css('#e'), value: '{{row.email}}' } },
        steps[1],
      ],
      {
        cleanup: [{ id: 'k', action: 'clearData', params: {} }],
      },
    );
    expect(lintTest(withVar)).toEqual([]);
  });

  it('judges selectors', () => {
    expect(isWeakStrategy('css', '#save')).toBe(false);
    expect(isWeakStrategy('css', '[data-testid="x"]')).toBe(false);
    expect(isWeakStrategy('css', '.a > .b > .c > .d')).toBe(true);
    expect(isWeakStrategy('xpath', '/html/body/div[2]/a')).toBe(true);
    expect(isWeakStrategy('label', 'Email')).toBe(false);
  });

  it('removes a step, also inside a group', () => {
    const t = tc([
      { id: 'a', action: 'goto', params: {} },
      {
        id: 'g',
        action: 'if',
        params: {},
        steps: [{ id: 'w', action: 'wait', params: { seconds: 1 } }],
      },
    ]);
    const r = removeStep(t, 'w');
    expect(JSON.stringify(r.steps)).not.toContain('"w"');
    expect(removeStep(t, 'a').steps).toHaveLength(1);
  });
});

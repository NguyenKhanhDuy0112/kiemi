import { describe, expect, it } from 'vitest';
import { elementCoverage, usedStrategies } from './element-coverage';

const el = (o: Partial<Parameters<typeof elementCoverage>[0][number]>) => ({
  role: 'button',
  name: '',
  id: '',
  testId: '',
  placeholder: '',
  ...o,
});

describe('element coverage [CV-03]', () => {
  const page = [
    el({ role: 'button', name: 'Lưu', id: 'save' }),
    el({ role: 'link', name: 'Hủy' }),
    el({ role: 'textbox', name: 'Họ tên', placeholder: 'Nhập họ tên', id: 'who' }),
    el({ role: 'button', name: 'Xóa', testId: 'delete' }),
  ];

  it('marks elements any test locator points at', () => {
    const r = elementCoverage(page, [
      [{ kind: 'role', role: 'button', name: 'Lưu' }],
      [{ kind: 'css', value: '#who' }],
      [{ kind: 'testId', value: 'delete' }],
    ]);
    expect(r.items.map((i) => i.covered)).toEqual([true, false, true, true]);
    expect(r.coveredPercent).toBe(75);
  });

  it('collects strategies of inline locators and element references, nested', () => {
    const used = usedStrategies({
      elements: { btn: { strategies: [{ kind: 'text', value: 'Hủy' }] } },
      steps: [
        { id: 'a', action: 'click', params: { target: { ref: 'btn' } } },
        {
          id: 'b',
          action: 'if',
          params: {
            steps: [
              {
                id: 'c',
                action: 'click',
                params: { target: { strategies: [{ kind: 'css', value: '#save' }] } },
              },
            ],
          },
        },
      ],
    });
    expect(used).toHaveLength(2);
    expect(elementCoverage(page, used).items.map((i) => i.covered)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('nothing on the page → no percent', () => {
    expect(elementCoverage([], []).coveredPercent).toBeNull();
  });
});

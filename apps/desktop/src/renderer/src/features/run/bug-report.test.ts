import { describe, expect, it } from 'vitest';
import { buildBugReport, expectationUpdate, mismatchOf } from './bug-report';

const labels = {
  title: 'Lỗi: {{test}}',
  environment: 'Môi trường',
  steps: 'Các bước',
  expected: 'Kỳ vọng',
  actual: 'Thực tế',
  error: 'Lỗi',
  screenshots: 'Ảnh',
};

describe('expectationUpdate [FX-07]', () => {
  it('writes the real value into the check', () => {
    const step = {
      action: 'assertText',
      params: { target: { ref: 'a' }, op: 'equals', value: 'x' },
    };
    expect(expectationUpdate(step, 'Đã lưu')).toEqual({ ...step.params, value: 'Đã lưu' });
    expect(expectationUpdate({ action: 'assertCount', params: { value: 3 } }, '5')).toEqual({
      value: 5,
    });
    expect(expectationUpdate({ action: 'assertToast', params: { text: 'a' } }, 'Xong')).toEqual({
      text: 'Xong',
    });
  });
  it('leaves checks without a plain value to the tester', () => {
    expect(expectationUpdate({ action: 'assertCount', params: {} }, 'abc')).toBeUndefined();
    expect(
      expectationUpdate({ action: 'assertToast', params: {} }, '(no message)'),
    ).toBeUndefined();
    expect(expectationUpdate({ action: 'assertDate', params: {} }, '1')).toBeUndefined();
    expect(expectationUpdate({ action: 'click', params: {} }, '1')).toBeUndefined();
  });
  it('reads expected / actual from the error details', () => {
    expect(mismatchOf({ expected: 'a', actual: 'b' })).toEqual({ expected: 'a', actual: 'b' });
    expect(mismatchOf({ expected: 1 })).toBeUndefined();
  });
});

describe('buildBugReport [X-02]', () => {
  it('lists the steps to reproduce, marks the failed one and shows expected vs actual', () => {
    const md = buildBugReport({
      testName: 'Tạo đơn',
      environment: 'UAT',
      steps: ['Mở trang', 'Bấm Lưu'],
      failedAt: 2,
      error: 'x',
      mismatch: { expected: 'Đã lưu', actual: 'Lỗi' },
      screenshots: ['step-2.png'],
      labels,
    });
    expect(md).toContain('## Lỗi: Tạo đơn');
    expect(md).toContain('**Môi trường:** UAT');
    expect(md).toContain('1. Mở trang\n2. Bấm Lưu ← ✗');
    expect(md).toContain('**Kỳ vọng:** Đã lưu\n**Thực tế:** Lỗi');
    expect(md).toContain('**Ảnh:** step-2.png');
  });
  it('falls back to the error message when there is nothing to compare', () => {
    const md = buildBugReport({
      testName: 'T',
      steps: ['A'],
      failedAt: 1,
      error: 'Không tìm thấy',
      labels,
    });
    expect(md).toContain('**Lỗi:** Không tìm thấy');
    expect(md).not.toContain('Môi trường');
  });
});

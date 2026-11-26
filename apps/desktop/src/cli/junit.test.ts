import { describe, expect, it } from 'vitest';
import { buildJunit } from './junit';

describe('JUnit XML [X-04]', () => {
  it('counts passed, failed, errored and skipped tests and escapes the text', () => {
    const xml = buildJunit({
      name: 'Smoke <UAT>',
      startedAt: new Date('2026-11-26T08:00:00Z'),
      cases: [
        { classname: 'Smoke', name: 'Đăng nhập', timeMs: 1500, status: 'passed' },
        {
          classname: 'Smoke',
          name: 'Tạo "đơn" (dòng 2)',
          timeMs: 2000,
          status: 'failed',
          message: 'Mong đợi <1> thấy 2 & 3',
        },
        {
          classname: 'Smoke',
          name: 'Duyệt',
          timeMs: 10,
          status: 'error',
          message: 'Hết thời gian\u0001',
        },
        {
          classname: 'Smoke',
          name: 'Bỏ qua',
          timeMs: 0,
          status: 'skipped',
          message: 'Khác môi trường',
        },
      ],
    });
    expect(xml).toContain(
      '<testsuites name="Smoke &#60;UAT&#62;" tests="4" failures="1" errors="1" skipped="1" time="3.510">',
    );
    expect(xml).toContain('timestamp="2026-11-26T08:00:00.000Z"');
    expect(xml).toContain('<testcase classname="Smoke" name="Đăng nhập" time="1.500"/>');
    expect(xml).toContain('name="Tạo &#34;đơn&#34; (dòng 2)"');
    expect(xml).toContain('<failure message="Mong đợi &#60;1&#62; thấy 2 &#38; 3"');
    expect(xml).toContain('<error message="Hết thời gian"');
    expect(xml).toContain('<skipped message="Khác môi trường"/>');
  });
});

import type { TestCase } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { buildHtmlReport } from './report';
import type { LiveRun } from './run-state';

const tx = (key: string, vars?: Record<string, unknown>, fallback?: string) => {
  const map: Record<string, string> = {
    'ui.steps.click.sentence': 'Bấm vào {{target}}',
    'ui.run.status.passed': 'Đạt',
    'ui.run.status.failed': 'Không đạt',
    'ui.run.summary': '{{passed}} / {{total}} test đạt',
    'ui.report.title': 'Báo cáo kiểm thử',
    'errors.codes.STEP_FAILED.message': 'Bước gặp lỗi: {{reason}}',
    'errors.codes.STEP_FAILED.hint': 'Thử chạy lại.',
    'errors.stepPrefix': 'Bước {{step}}: {{message}}',
  };
  const s = map[key] ?? fallback ?? key;
  return s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars?.[k] ?? ''));
};

const doc = {
  schemaVersion: 2,
  id: 't1',
  name: 'Đăng nhập',
  sessions: ['default'],
  elements: {},
  variables: {},
  tags: [],
  steps: [
    {
      id: 's1',
      action: 'click',
      params: { target: { text: 'Lưu' } },
      enabled: true,
      mode: 'hard',
      session: 'default',
    },
  ],
  cleanup: [],
} as unknown as TestCase;

const run: LiveRun = {
  runId: 'r1',
  status: 'failed',
  stopping: false,
  durationMs: 2500,
  target: { kind: 'test', testCaseId: 't1', name: 'Đăng nhập <script>' },
  cases: [
    {
      runCaseId: 'c1',
      testCaseId: 't1',
      testName: 'Đăng nhập',
      status: 'failed',
      stepCount: 1,
      stepsDone: 1,
      artifacts: [],
      steps: {
        s1: {
          status: 'failed',
          stepNo: '1',
          durationMs: 1000,
          error: { code: 'STEP_FAILED', message: 'boom', details: { stepNo: 1 } },
          artifacts: [{ kind: 'screenshot', path: 'shot.png' }],
        },
      },
    },
  ],
};

describe('HTML report [I-05]', () => {
  it('is one self-contained file with steps, errors and inline screenshots', () => {
    const html = buildHtmlReport({
      run,
      title: 'Đăng nhập <script>',
      environmentName: 'UAT',
      startedAt: new Date(2026, 10, 16, 9, 5),
      tests: { t1: doc },
      screenshots: { 'shot.png': 'data:image/png;base64,AAAA' },
      tx,
      now: new Date(2026, 10, 16, 9, 10),
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Bấm vào “Lưu”');
    expect(html).toContain('Bước 1: Bước gặp lỗi: boom');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('16/11/2026 09:05');
    expect(html).toContain('0 / 1 test đạt');
    // Escaped, and nothing loaded from outside.
    expect(html).not.toContain('<script');
    expect(html).toContain('&#60;script&#62;');
    expect(html).not.toMatch(/(src|href)="(https?:|\/\/|kiemi-artifact:)/);
  });
});

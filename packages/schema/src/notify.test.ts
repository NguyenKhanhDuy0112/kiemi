import { describe, expect, it } from 'vitest';
import {
  checkSecret,
  NotifyConfigSchema,
  type RunSummary,
  shouldNotify,
  summaryText,
  webhookRequest,
} from './notify';

const failed: RunSummary = {
  projectName: 'Kiemi',
  targetName: 'Smoke',
  status: 'failed',
  total: 12,
  passed: 10,
  failed: 2,
  durationMs: 61_240,
  environmentName: 'UAT',
  resultsPath: '/runs/abc',
  failures: [
    { test: 'Đăng nhập', message: 'Không thấy nút' },
    { test: 'Tạo đơn', message: 'Sai tổng tiền' },
  ],
};
const config = NotifyConfigSchema.parse({ chatId: '-100' });

describe('result notifications [X-03]', () => {
  it('says what happened, which tests failed and where the results are', () => {
    const t = summaryText(failed);
    expect(t).toContain('❌ Kiemi · Smoke: CÓ LỖI');
    expect(t).toContain('10/12 test đạt, 2 lỗi · 61.2 giây · Môi trường: UAT');
    expect(t).toContain('• Tạo đơn — Sai tổng tiền');
    expect(t).toContain('Kết quả: /runs/abc');
  });
  it('lists at most 10 failures', () => {
    const many = {
      ...failed,
      failures: Array.from({ length: 25 }, (_, i) => ({ test: `T${i}`, message: 'x' })),
    };
    const t = summaryText(many);
    expect(t).toContain('• T9 — x');
    expect(t).not.toContain('• T10');
    expect(t).toContain('và 15 test lỗi khác');
  });
  it('sends only failures when asked', () => {
    expect(shouldNotify('failed', { ...failed, status: 'passed' })).toBe(false);
    expect(shouldNotify('failed', failed)).toBe(true);
    expect(shouldNotify('always', { ...failed, status: 'passed' })).toBe(true);
  });
  it('builds the request of each service', () => {
    const slack = webhookRequest('slack', 'https://hooks.slack.com/x', config, failed);
    expect(slack?.url).toBe('https://hooks.slack.com/x');
    expect(JSON.parse(slack?.body ?? '').text).toContain('CÓ LỖI');
    expect(
      JSON.parse(
        webhookRequest('gchat', 'https://chat.googleapis.com/x', config, failed)?.body ?? '',
      ).text,
    ).toContain('Smoke');
    const teams = JSON.parse(
      webhookRequest('teams', 'https://x.webhook.office.com/y', config, failed)?.body ?? '',
    );
    expect(teams.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
    const tg = webhookRequest('telegram', '123456:ABCDEFGHIJKLMNOPQRSTUV', config, failed);
    expect(tg?.url).toBe('https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUV/sendMessage');
    expect(JSON.parse(tg?.body ?? '')).toMatchObject({ chat_id: '-100' });
    expect(webhookRequest('email', '', config, failed)).toBeNull();
  });
  it('checks the secret of each kind', () => {
    expect(checkSecret('slack', 'https://hooks.slack.com/x')).toBeNull();
    expect(checkSecret('slack', 'http://hooks.slack.com/x')).toMatch(/https/);
    expect(checkSecret('teams', 'nope')).toMatch(/không hợp lệ/);
    expect(checkSecret('telegram', '123456:ABCDEFGHIJKLMNOPQRSTUV')).toBeNull();
    expect(checkSecret('telegram', 'abc')).toMatch(/Telegram/);
    expect(checkSecret('email', '')).toBeNull();
  });
});

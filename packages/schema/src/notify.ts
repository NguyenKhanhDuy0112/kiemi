import { z } from 'zod';

export const NOTIFY_KINDS = ['slack', 'teams', 'gchat', 'telegram', 'email'] as const;
export const NotifyKindSchema = z.enum(NOTIFY_KINDS);
export type NotifyKind = z.infer<typeof NotifyKindSchema>;

/** Non-secret settings of a channel. */
export const NotifyConfigSchema = z.object({
  /** Telegram. */
  chatId: z.string().max(100).default(''),
  /** Email. */
  host: z.string().max(200).default(''),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  username: z.string().max(200).default(''),
  from: z.string().max(200).default(''),
  to: z.string().max(1000).default(''),
});
export type NotifyConfig = z.infer<typeof NotifyConfigSchema>;

/** Secret part: webhook URL (Slack, Teams, Google Chat), bot token (Telegram), SMTP password. */
export const NotifySecretSchema = z.object({ secret: z.string().max(2000).default('') });

export const NotifyChannelInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: NotifyKindSchema,
  enabled: z.boolean().default(true),
  /** Send for every run, or only when something failed. */
  when: z.enum(['always', 'failed']).default('always'),
  config: NotifyConfigSchema.default(() => NotifyConfigSchema.parse({})),
});
export type NotifyChannelInput = z.infer<typeof NotifyChannelInputSchema>;

/** What the message says about a finished run. */
export interface RunSummary {
  projectName: string;
  /** Test, suite or tag that was run. */
  targetName: string;
  status: 'passed' | 'failed' | 'cancelled' | 'error';
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  environmentName?: string | undefined;
  /** Where the results are (a folder on the machine that ran). */
  resultsPath?: string | undefined;
  failures: { test: string; message: string }[];
}

const ICON: Record<RunSummary['status'], string> = {
  passed: '✅',
  failed: '❌',
  error: '⚠️',
  cancelled: '⏹️',
};
const WORD: Record<RunSummary['status'], string> = {
  passed: 'ĐẠT',
  failed: 'CÓ LỖI',
  error: 'LỖI HỆ THỐNG',
  cancelled: 'ĐÃ DỪNG',
};
const MAX_FAILURES = 10;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function summaryTitle(s: RunSummary): string {
  return `${ICON[s.status]} ${s.projectName} · ${s.targetName}: ${WORD[s.status]}`;
}

/** Plain-text message (Slack mrkdwn, Google Chat, Telegram and email all show it fine). */
export function summaryText(s: RunSummary): string {
  const sec = Math.round(s.durationMs / 100) / 10;
  const lines = [
    summaryTitle(s),
    `${s.passed}/${s.total} test đạt${s.failed ? `, ${s.failed} lỗi` : ''} · ${sec} giây${s.environmentName ? ` · Môi trường: ${s.environmentName}` : ''}`,
  ];
  for (const f of s.failures.slice(0, MAX_FAILURES))
    lines.push(`• ${cut(f.test, 120)} — ${cut(f.message, 200)}`);
  if (s.failures.length > MAX_FAILURES)
    lines.push(`… và ${s.failures.length - MAX_FAILURES} test lỗi khác`);
  if (s.resultsPath) lines.push(`Kết quả: ${s.resultsPath}`);
  return lines.join('\n');
}

/** Should this channel speak about the run? */
export function shouldNotify(when: 'always' | 'failed', s: RunSummary): boolean {
  return when === 'always' || s.status !== 'passed';
}

export interface HttpRequestSpec {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Address the secret must have for a kind; `null` = fine. Telegram's secret is the bot token. */
export function checkSecret(kind: NotifyKind, secret: string): string | null {
  if (kind === 'email') return null;
  if (kind === 'telegram')
    return /^\d+:[\w-]{20,}$/.test(secret) ? null : 'Mã bot Telegram không đúng dạng 123456:ABC…';
  try {
    const u = new URL(secret);
    return u.protocol === 'https:' ? null : 'Địa chỉ webhook phải bắt đầu bằng https://';
  } catch {
    return 'Địa chỉ webhook không hợp lệ';
  }
}

/** HTTP request for a webhook kind; email is not HTTP (`null`). */
export function webhookRequest(
  kind: NotifyKind,
  secret: string,
  config: NotifyConfig,
  s: RunSummary,
): HttpRequestSpec | null {
  const json = { 'content-type': 'application/json; charset=utf-8' };
  const text = summaryText(s);
  switch (kind) {
    case 'slack':
    case 'gchat':
      return { url: secret, headers: json, body: JSON.stringify({ text }) };
    case 'teams':
      // Power Automate "Workflows" webhooks take an Adaptive Card.
      return {
        url: secret,
        headers: json,
        body: JSON.stringify({
          type: 'message',
          attachments: [
            {
              contentType: 'application/vnd.microsoft.card.adaptive',
              content: {
                $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                type: 'AdaptiveCard',
                version: '1.4',
                body: [
                  { type: 'TextBlock', text: summaryTitle(s), weight: 'Bolder', wrap: true },
                  { type: 'TextBlock', text: text.split('\n').slice(1).join('\n\n'), wrap: true },
                ],
              },
            },
          ],
        }),
      };
    case 'telegram':
      return {
        url: `https://api.telegram.org/bot${secret}/sendMessage`,
        headers: json,
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          disable_web_page_preview: true,
        }),
      };
    case 'email':
      return null;
  }
}

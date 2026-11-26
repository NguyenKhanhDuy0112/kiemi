import type { NotifyChannelForSend, Services } from '@kiemi/db';
import { type RunSummary, shouldNotify, summaryText, webhookRequest } from '@kiemi/schema';
import { describeRunError, plainTranslator, vi } from '@kiemi/shared';
import nodemailer from 'nodemailer';

const TIMEOUT_MS = 10_000;
const t = plainTranslator(vi);

/** What actually leaves the machine; replaceable in tests. */
export interface NotifyTransport {
  fetch(
    url: string,
    init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal },
  ): Promise<{ ok: boolean; status: number }>;
  sendMail(
    smtp: { host: string; port: number; secure: boolean; user: string; pass: string },
    mail: { from: string; to: string; subject: string; text: string },
  ): Promise<void>;
}

export const realTransport: NotifyTransport = {
  fetch: (url, init) => fetch(url, init),
  async sendMail(smtp, mail) {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
      connectionTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    try {
      await transport.sendMail(mail);
    } finally {
      transport.close();
    }
  },
};

export interface SendResult {
  ok: boolean;
  message: string;
}

/** Sends the summary to one channel. Never throws: the result says what happened. */
export async function sendToChannel(
  ch: NotifyChannelForSend,
  summary: RunSummary,
  transport: NotifyTransport = realTransport,
): Promise<SendResult> {
  try {
    if (ch.kind === 'email') {
      const { host, port, secure, username, from, to } = ch.config;
      if (!host || !from || !to)
        return { ok: false, message: 'Thiếu máy chủ, người gửi hoặc người nhận' };
      await transport.sendMail(
        { host, port, secure, user: username, pass: ch.secret },
        {
          from,
          to,
          subject: summaryText(summary).split('\n')[0] ?? '',
          text: summaryText(summary),
        },
      );
      return { ok: true, message: 'Đã gửi email' };
    }
    const req = webhookRequest(ch.kind, ch.secret, ch.config, summary);
    if (!req) return { ok: false, message: 'Kênh chưa cấu hình' };
    const res = await transport.fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok
      ? { ok: true, message: 'Đã gửi' }
      : { ok: false, message: `Máy chủ trả về lỗi ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message.slice(0, 200) : 'Không gửi được',
    };
  }
}

/** The finished run as a message summary (errors in plain Vietnamese). */
export function summarizeRun(services: Services, runId: string): RunSummary {
  const run = services.runs.detail(runId);
  const project = services.projects.repo.find(run.projectId, true);
  const env = run.environmentId
    ? services.environments.repo.find(run.environmentId, true)
    : undefined;
  const names = new Map<string, string>();
  const nameOf = (id: string) => {
    if (!names.has(id)) names.set(id, services.testCases.repo.find(id, true)?.name ?? '');
    return names.get(id) ?? '';
  };
  const bad = run.cases.filter((c) => c.status === 'failed' || c.status === 'error');
  const failures = bad.map((c) => {
    const err = c.steps.find((s) => s.error && s.status === 'failed')?.error ?? c.error;
    const row = c.rowIndex == null ? '' : ` (dòng ${c.rowIndex + 1})`;
    return {
      test: `${nameOf(c.testCaseId)}${row}`,
      message: err ? describeRunError(err, t).message : 'Không đạt',
    };
  });
  const status = run.status === 'queued' || run.status === 'running' ? 'error' : run.status;
  return {
    projectName: project?.name ?? '',
    targetName: run.target?.name ?? 'Chạy test',
    status,
    total: run.cases.length,
    passed: run.cases.filter((c) => c.status === 'passed').length,
    failed: bad.length,
    durationMs: run.durationMs ?? 0,
    ...(env ? { environmentName: env.name } : {}),
    ...(run.artifactDir ? { resultsPath: run.artifactDir } : {}),
    failures,
  };
}

/** After a run: tells every enabled channel that wants to know. Best effort, never throws. */
export async function notifyRun(
  services: Services,
  runId: string,
  transport: NotifyTransport = realTransport,
): Promise<void> {
  try {
    const run = services.runs.get(runId);
    const channels = services.notifyChannels.forSend(run.projectId);
    if (channels.length === 0) return;
    const summary = summarizeRun(services, runId);
    await Promise.all(
      channels
        .filter((c) => shouldNotify(c.when, summary))
        .map(async (c) => {
          const r = await sendToChannel(c, summary, transport);
          try {
            services.notifyChannels.setResult(c.id, r.ok, r.message);
          } catch {
            // the channel was deleted meanwhile
          }
        }),
    );
  } catch {
    // a notification problem never changes the run
  }
}

/** "Send a test" button: a made-up result through the real path. */
export async function sendTest(
  ch: NotifyChannelForSend,
  transport: NotifyTransport = realTransport,
): Promise<SendResult> {
  return sendToChannel(
    ch,
    {
      projectName: 'Kiemi',
      targetName: 'Tin thử',
      status: 'passed',
      total: 3,
      passed: 3,
      failed: 0,
      durationMs: 1200,
      failures: [],
    },
    transport,
  );
}

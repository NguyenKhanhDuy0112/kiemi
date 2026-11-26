// @vitest-environment node
import { createMemoryServices } from '@kiemi/db';
import { type RunSummary, summaryText } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { type NotifyTransport, notifyRun, sendTest, sendToChannel, summarizeRun } from './send';

function fakeTransport(status = 200) {
  const calls: { url: string; body: string }[] = [];
  const mails: { smtp: unknown; mail: { subject: string; text: string; to: string } }[] = [];
  const transport: NotifyTransport = {
    fetch: async (url, init) => {
      calls.push({ url, body: init.body });
      return { ok: status < 400, status };
    },
    sendMail: async (smtp, mail) => {
      mails.push({ smtp, mail });
    },
  };
  return { transport, calls, mails };
}

const hook = 'https://hooks.slack.com/services/T000/B000/XXXX';
const base = { enabled: true, when: 'always' as const };

function finishedRun() {
  const { services, defaultProjectId: p } = createMemoryServices();
  const t1 = services.testCases.create({ projectId: p, name: 'Đăng nhập' });
  const t2 = services.testCases.create({ projectId: p, name: 'Tạo đơn' });
  const run = services.runs.create({
    projectId: p,
    artifactDir: '/runs/r1',
    target: { kind: 'suite', suiteId: 's', name: 'Smoke' },
  });
  const c1 = services.runs.addCase({ runId: run.id, testCaseId: t1.id });
  const c2 = services.runs.addCase({ runId: run.id, testCaseId: t2.id });
  services.runs.finishCase(c1.id, { status: 'passed', durationMs: 10 } as never);
  services.runs.finishCase(c2.id, {
    status: 'failed',
    durationMs: 10,
    error: { code: 'STEP_TIMEOUT', message: 'x', details: { step: 2, timeoutMs: 5000 } },
  } as never);
  services.runs.finish(run.id, 'failed');
  return { services, projectId: p, runId: run.id };
}

describe('sending result notifications [X-03]', () => {
  it('summarises a run in plain Vietnamese with the failed tests', () => {
    const { services, runId } = finishedRun();
    const s = summarizeRun(services, runId);
    expect(s).toMatchObject({
      targetName: 'Smoke',
      status: 'failed',
      total: 2,
      passed: 1,
      failed: 1,
    });
    expect(s.failures[0]?.test).toBe('Tạo đơn');
    expect(s.failures[0]?.message).toMatch(/^Bước 2/);
    expect(summaryText(s)).toContain('Kết quả: /runs/r1');
  });

  it('tells every enabled channel that wants to know, and records the outcome', async () => {
    const { services, projectId, runId } = finishedRun();
    services.notifyChannels.save(
      projectId,
      { name: 'Slack', kind: 'slack', ...base } as never,
      hook,
    );
    services.notifyChannels.save(
      projectId,
      { name: 'Chỉ lỗi', kind: 'teams', ...base, when: 'failed' } as never,
      'https://x.webhook.office.com/y',
    );
    const { transport, calls } = fakeTransport();
    await notifyRun(services, runId, transport);
    expect(calls.map((c) => c.url).sort()).toEqual([hook, 'https://x.webhook.office.com/y']);
    expect(services.notifyChannels.list(projectId).every((c) => c.lastOk === true)).toBe(true);
  });

  it('skips "failed only" channels for a passing run', async () => {
    const { services, projectId, runId } = finishedRun();
    services.runs.repo.update(runId, { status: 'passed' });
    services.notifyChannels.save(
      projectId,
      { name: 'Chỉ lỗi', kind: 'slack', ...base, when: 'failed' } as never,
      hook,
    );
    const { transport, calls } = fakeTransport();
    await notifyRun(services, runId, transport);
    expect(calls).toEqual([]);
  });

  it('reports a rejected webhook instead of throwing', async () => {
    const { services, projectId, runId } = finishedRun();
    services.notifyChannels.save(
      projectId,
      { name: 'Slack', kind: 'slack', ...base } as never,
      hook,
    );
    await notifyRun(services, runId, fakeTransport(404).transport);
    expect(services.notifyChannels.list(projectId)[0]).toMatchObject({
      lastOk: false,
      lastMessage: 'Máy chủ trả về lỗi 404',
    });
  });

  it('sends email through SMTP settings with the password as the secret', async () => {
    const { services, projectId } = finishedRun();
    const info = services.notifyChannels.save(
      projectId,
      {
        name: 'Mail',
        kind: 'email',
        ...base,
        config: {
          host: 'smtp.example.com',
          port: 465,
          secure: true,
          username: 'bot',
          from: 'qa@x.vn',
          to: 'a@x.vn, b@x.vn',
          chatId: '',
        },
      } as never,
      'mat-khau',
    );
    const f = fakeTransport();
    const r = await sendTest(services.notifyChannels.forTest(info.id), f.transport);
    expect(r.ok).toBe(true);
    expect(f.mails[0]?.smtp).toEqual({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'bot',
      pass: 'mat-khau',
    });
    expect(f.mails[0]?.mail).toMatchObject({
      to: 'a@x.vn, b@x.vn',
      subject: expect.stringContaining('ĐẠT'),
    });
  });

  it('turns network errors and missing settings into messages', async () => {
    const summary: RunSummary = {
      projectName: 'p',
      targetName: 't',
      status: 'passed',
      total: 1,
      passed: 1,
      failed: 0,
      durationMs: 1,
      failures: [],
    };
    const boom: NotifyTransport = {
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
      sendMail: async () => undefined,
    };
    const { services, projectId } = finishedRun();
    const ch = services.notifyChannels.save(
      projectId,
      { name: 'S', kind: 'slack', ...base } as never,
      hook,
    );
    expect(await sendToChannel(services.notifyChannels.forTest(ch.id), summary, boom)).toEqual({
      ok: false,
      message: 'ECONNREFUSED',
    });
    const mail = services.notifyChannels.save(projectId, {
      name: 'M',
      kind: 'email',
      ...base,
    } as never);
    expect(
      (
        await sendToChannel(
          services.notifyChannels.forTest(mail.id),
          summary,
          fakeTransport().transport,
        )
      ).message,
    ).toMatch(/Thiếu/);
  });
});

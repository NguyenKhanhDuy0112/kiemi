import { createMemoryServices } from '@kiemi/db';
import { NotifyChannelInputSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { notifyRun } from '../notify/send';
import { createIssue } from './create';

function setup(kind: 'github' | 'jira', config: Record<string, string>) {
  const { services, defaultProjectId: p } = createMemoryServices();
  const ch = services.notifyChannels.save(
    p,
    NotifyChannelInputSchema.parse({ name: 'Bug', kind, config }),
    'tok-123',
  );
  return { services, p, ch };
}

describe('create issue [X-02]', () => {
  it('sends the request the tracker expects and returns the issue link', async () => {
    const { services, ch } = setup('github', { project: 'cty/app' });
    const seen: { url: string; auth: string | undefined; body: string }[] = [];
    const r = await createIssue(
      services,
      ch.id,
      { title: 'Lỗi', body: 'Chi tiết' },
      {
        fetch: async (url, init) => {
          seen.push({ url, auth: init.headers.authorization, body: init.body });
          return {
            ok: true,
            status: 201,
            body: { html_url: 'https://github.com/cty/app/issues/7' },
          };
        },
      },
    );
    expect(r).toMatchObject({ ok: true, url: 'https://github.com/cty/app/issues/7' });
    expect(seen[0]?.auth).toBe('Bearer tok-123');
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({ title: 'Lỗi', body: 'Chi tiết' });
  });

  it('reports a tracker error and a missing setting without sending', async () => {
    const { services, ch } = setup('github', { project: 'cty/app' });
    const bad = await createIssue(
      services,
      ch.id,
      { title: 'x', body: '' },
      {
        fetch: async () => ({ ok: false, status: 401 }),
      },
    );
    expect(bad).toMatchObject({ ok: false, message: expect.stringContaining('401') });
    const jira = setup('jira', { project: 'HR' });
    let called = false;
    const r = await createIssue(
      jira.services,
      jira.ch.id,
      { title: 'x', body: '' },
      {
        fetch: async () => {
          called = true;
          return { ok: true, status: 200 };
        },
      },
    );
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });

  it('a tracker is never told about run results', async () => {
    const { services, p } = setup('github', { project: 'cty/app' });
    const t = services.testCases.create({ projectId: p, name: 'T' });
    const run = services.runs.create({
      projectId: p,
      artifactDir: '/r',
      target: { kind: 'test', testCaseId: t.id, name: 'T' },
    });
    services.runs.finish(run.id, 'failed');
    let calls = 0;
    await notifyRun(services, run.id, {
      fetch: async () => {
        calls++;
        return { ok: true, status: 200 };
      },
      sendMail: async () => undefined,
    });
    expect(calls).toBe(0);
  });
});

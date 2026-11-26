import { describe, expect, it } from 'vitest';
import { createMemoryServices } from './testing';

const slack = { name: 'Slack QA', kind: 'slack' as const, enabled: true, when: 'failed' as const };
const hook = 'https://hooks.slack.com/services/T000/B000/XXXX';

describe('notify channels [X-03]', () => {
  it('stores the webhook encrypted and never lists it', () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const info = services.notifyChannels.save(p, slack as never, hook);
    expect(info).toMatchObject({ name: 'Slack QA', when: 'failed', hasSecret: true });
    const raw = services.notifyChannels.repo.get(info.id).ciphertext?.toString('utf8') ?? '';
    expect(raw).not.toContain('hooks.slack.com');
    expect(JSON.stringify(services.notifyChannels.list(p))).not.toContain('hooks.slack.com');
    expect(services.notifyChannels.forSend(p)[0]?.secret).toBe(hook);
  });
  it('keeps the secret when updating without one, and checks a new one', () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const a = services.notifyChannels.save(p, slack as never, hook);
    services.notifyChannels.save(
      p,
      { ...slack, name: 'Slack 2', enabled: false } as never,
      undefined,
      a.id,
    );
    expect(services.notifyChannels.list(p)[0]).toMatchObject({
      name: 'Slack 2',
      enabled: false,
      hasSecret: true,
    });
    expect(services.notifyChannels.forSend(p)).toEqual([]); // disabled
    expect(services.notifyChannels.forTest(a.id).secret).toBe(hook);
    expect(() => services.notifyChannels.save(p, slack as never, 'http://insecure', a.id)).toThrow(
      /https/,
    );
  });
  it('records the last result and removes channels', () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const a = services.notifyChannels.save(p, slack as never, hook);
    services.notifyChannels.setResult(a.id, false, 'HTTP 404');
    expect(services.notifyChannels.list(p)[0]).toMatchObject({
      lastOk: false,
      lastMessage: 'HTTP 404',
    });
    services.notifyChannels.remove(a.id);
    expect(services.notifyChannels.list(p)).toEqual([]);
  });
});

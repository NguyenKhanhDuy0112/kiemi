import { createMemoryServices } from '@kiemi/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gatewayFor, guardAndLog } from './gateway';

const settings = {
  enabled: true,
  kind: 'claude' as const,
  model: 'm',
  taskModels: {},
  baseUrl: '',
  localOnly: false,
  limitTokens: null,
  priceIn: null,
  priceOut: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('AI gateway wiring [AI-02, AI-04, AI-21]', () => {
  it('is unavailable while AI is off for the project', () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    expect(() => gatewayFor(services, p)).toThrow(/off/);
  });

  it('hides project secrets, records usage and logs blocked actions', async () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const env = services.environments.create({ projectId: p, name: 'UAT', type: 'uat' } as never);
    services.environments.setSecret(env.id, 'pw', 'Sup3rS3cret!');
    services.aiSettings.save(p, settings, 'sk-key');

    const bodies: string[] = [];
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'hi' }],
          usage: { input_tokens: 4, output_tokens: 2 },
        }),
      );
    });
    const g = gatewayFor(services, p);
    await g.ask({ messages: [{ role: 'user', content: 'password Sup3rS3cret! mail a@b.vn' }] });
    expect(bodies[0]).not.toMatch(/Sup3rS3cret|a@b\.vn/);
    expect(services.aiSettings.get(p)?.usage).toMatchObject({ tokens: 6, calls: 1 });

    expect(() => guardAndLog(services, p, { kind: 'save' }, { approved: false })).toThrow();
    expect(services.aiSettings.audit(p)[0]).toMatchObject({ action: 'save', allowed: false });
  });
});

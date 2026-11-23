// @vitest-environment node
import { createMemoryServices } from '@kiemi/db';
import { describe, expect, it } from 'vitest';
import { createTestRunManager } from '../run/testing';
import { createCaller } from './root';

function caller() {
  const { services, defaultProjectId } = createMemoryServices();
  return {
    c: createCaller({
      appVersion: '1',
      platform: 'darwin',
      services,
      defaultProjectId,
      runs: createTestRunManager(services),
    }),
    projectId: defaultProjectId,
    services,
  };
}

describe('system router [M3-03, S-07, G-07]', () => {
  it('lists every action with a JSON Schema for the form', async () => {
    const { c } = caller();
    const actions = await c.system.actions();
    const fill = actions.find((a) => a.type === 'fill');
    expect(fill).toMatchObject({ group: 'input', container: false });
    expect(fill?.schema).toMatchObject({
      type: 'object',
      properties: { value: expect.anything(), clear: { type: 'boolean', default: true } },
    });
    expect((fill?.schema as { required?: string[] } | undefined)?.required).toEqual(
      expect.arrayContaining(['target', 'value']),
    );
    expect(actions.find((a) => a.type === 'if')).toMatchObject({
      container: true,
      rawParams: ['condition', 'steps', 'elseSteps'],
    });
    expect(actions.length).toBeGreaterThan(30);
  });

  it('reads and saves settings with defaults', async () => {
    const { c } = caller();
    expect(await c.system.settings()).toMatchObject({
      language: 'vi',
      theme: 'system',
      browser: 'auto',
      defaultTimeoutSec: 10,
    });
    expect(await c.system.updateSettings({ theme: 'dark', defaultTimeoutSec: 20 })).toMatchObject({
      theme: 'dark',
      defaultTimeoutSec: 20,
    });
    await expect(c.system.updateSettings({ defaultTimeoutSec: 0 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('stores SSH settings on an environment and tests the connection', async () => {
    const { c, projectId } = caller();
    const env = await c.environments.create({
      projectId,
      name: 'Nội bộ',
      ssh: {
        enabled: true,
        target: { host: '127.0.0.1', port: 1, username: 'u', passwordSecret: 'sshPass' },
      },
    });
    expect((await c.environments.get({ id: env.id })).ssh).toMatchObject({
      target: { host: '127.0.0.1', port: 1 },
    });
    const [web] = await c.products.list({ projectId });
    const res = await c.system.testSsh({ environmentId: env.id, productId: web?.id as string });
    expect(res).toMatchObject({ ok: false, reason: 'missingSecret' });
  });
});

describe('updateSettings keeps the other settings [S-07]', () => {
  it('saving one key does not reset the rest', async () => {
    const { c } = caller();
    await c.system.updateSettings({ theme: 'dark', onboardingDone: true });
    const after = await c.system.updateSettings({ tourDone: true });
    expect(after).toMatchObject({ theme: 'dark', onboardingDone: true, tourDone: true });
  });
});

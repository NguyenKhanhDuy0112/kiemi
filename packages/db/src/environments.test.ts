import { describe, expect, it } from 'vitest';
import { DbError } from './repo';
import { createMemoryServices, fakeCipher } from './testing';

describe('environments, variables, secrets [S-06, E-08, N-07]', () => {
  it('stores variables and replaces them', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const env = s.environments.create({
      projectId,
      name: 'UAT',
      baseUrl: 'https://uat.example.com',
    });
    s.environments.setVariables(env.id, { portalUrl: 'https://p', user: 'an' });
    expect(s.environments.setVariables(env.id, { portalUrl: 'https://p2', lang: 'vi' })).toEqual({
      lang: 'vi',
      portalUrl: 'https://p2',
    });
    expect(() => s.environments.setVariables(env.id, { 'bad-name': 'x' })).toThrow(DbError);
    expect(() => s.environments.create({ projectId, name: 'uat' })).toThrow(/already exists/);
  });

  it('encrypts secrets, never returns values to the UI, decrypts for runs', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const env = s.environments.create({
      projectId,
      name: 'Staging',
      proxy: { server: 'http://proxy:3128', username: 'u', passwordSecret: 'proxyPass' },
    });
    s.environments.setSecret(env.id, 'nvPass', 'P@ss-123');
    s.environments.setSecret(env.id, 'proxyPass', 'px');
    s.environments.setSecret(env.id, 'nvPass', 'P@ss-456'); // replace
    const raw = s.environments.secrets.list().map((r) => r.ciphertext.toString('utf8'));
    expect(raw.join()).not.toContain('P@ss');
    const view = s.environments.get(env.id);
    expect(view.secrets.map((x) => x.name)).toEqual(['nvPass', 'proxyPass']);
    expect(JSON.stringify(view)).not.toContain('P@ss');
    const run = s.environments.forRun(env.id);
    expect(run.secrets).toEqual({ nvPass: 'P@ss-456', proxyPass: 'px' });
    expect(run.env).toMatchObject({
      name: 'Staging',
      secretNames: ['nvPass', 'proxyPass'],
      defaultProduct: 'web',
      apps: { web: { proxy: { server: 'http://proxy:3128' } } },
    });
    s.environments.removeSecret(env.id, 'proxyPass');
    expect(s.environments.listSecrets(env.id).map((x) => x.name)).toEqual(['nvPass']);
  });

  it('refuses to store secrets without the OS keychain', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices(fakeCipher(false));
    const env = s.environments.list(projectId)[0];
    expect(env).toBeDefined();
    let err: unknown;
    try {
      s.environments.setSecret(env?.id as string, 'x', 'y');
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'SECRETS_UNAVAILABLE' });
  });
});

describe('Environment × Product matrix [O-02]', () => {
  const setup = () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const web = s.products.defaultFor(projectId);
    const admin = s.products.create({ projectId, name: 'Admin' });
    const api = s.products.create({ projectId, name: 'API', kind: 'api' });
    const uat = s.environments.create({ projectId, name: 'UAT' });
    return { s, projectId, web, admin, api, uat };
  };

  it('each cell has its own URL, variables, proxy and SSH; no cell = not available', () => {
    const { s, web, admin, uat } = setup();
    s.environments.setCell(uat.id, web.id, { url: 'https://uat.example.com' });
    s.environments.setCell(uat.id, admin.id, {
      url: 'https://admin.uat.example.com',
      variables: { user: 'admin01' },
      ssh: {
        enabled: true,
        target: {
          host: 'bastion',
          port: 22,
          username: 'qa',
          auth: 'password',
          passwordSecret: 'sshPass',
        },
      },
    });
    const { env } = s.environments.forRun(uat.id);
    expect(env.baseUrl).toBe('https://uat.example.com');
    expect(env.defaultProduct).toBe('web');
    expect(env.apps.web).toMatchObject({
      name: 'Web',
      url: 'https://uat.example.com',
      missing: false,
    });
    expect(env.apps.admin).toMatchObject({
      url: 'https://admin.uat.example.com',
      variables: { user: 'admin01' },
      ssh: { target: { host: 'bastion' } },
    });
    expect(env.apps.api).toEqual({ name: 'API', variables: {}, missing: true });
    // Removing a cell: the product is no longer available there.
    s.environments.setCell(uat.id, admin.id, null);
    expect(s.environments.forRun(uat.id).env.apps.admin?.missing).toBe(true);
    expect(() => s.environments.setCell(uat.id, web.id, { url: 'not a url' })).toThrow(DbError);
  });

  it('baseUrl/proxy/ssh on create/update go to the default product cell (v1.0 callers)', () => {
    const { s, projectId, web } = setup();
    const e = s.environments.create({ projectId, name: 'DEV', baseUrl: 'http://dev.local' });
    expect(s.environments.cell(e.id, web.id)?.url).toBe('http://dev.local');
    s.environments.update(e.id, { baseUrl: 'http://dev2.local' });
    expect(s.environments.get(e.id)).toMatchObject({ baseUrl: 'http://dev2.local', proxy: null });
    expect(s.environments.cells(e.id)).toHaveLength(1);
  });

  it('duplicating an environment copies cells, variables and secret names — not secret values', () => {
    const { s, web, admin, uat } = setup();
    s.environments.setCell(uat.id, web.id, { url: 'https://uat.example.com' });
    s.environments.setCell(uat.id, admin.id, { url: 'https://a.uat', variables: { u: 'x' } });
    s.environments.setVariables(uat.id, { lang: 'vi' });
    s.environments.setSecret(uat.id, 'pass', 'P@ss');
    const copy = s.environments.duplicate(uat.id, 'Staging');
    expect(copy.name).toBe('Staging');
    expect(s.environments.cells(copy.id).map((c) => [c.url, c.variables])).toEqual([
      ['https://uat.example.com', {}],
      ['https://a.uat', { u: 'x' }],
    ]);
    expect(s.environments.variables(copy.id)).toEqual({ lang: 'vi' });
    expect(s.environments.missingSecrets(copy.id)).toEqual(['pass']);
    expect(s.environments.forRun(copy.id).secrets).toEqual({});
  });

  it('removing a product or an environment removes its cells', () => {
    const { s, projectId, web, admin, uat } = setup();
    s.environments.setCell(uat.id, web.id, { url: 'https://uat.example.com' });
    s.environments.setCell(uat.id, admin.id, { url: 'https://a.uat' });
    s.products.remove(admin.id);
    expect(s.environments.cells(uat.id).map((c) => c.productId)).toEqual([web.id]);
    s.environments.remove(uat.id);
    expect(s.environments.matrix(projectId).filter((c) => c.environmentId === uat.id)).toEqual([]);
  });

  it('backfill moves v1.0 baseUrl/proxy/ssh into the default product cell once', () => {
    const { s, projectId, web } = setup();
    const old = s.environments.repo.create({
      projectId,
      name: 'Old',
      baseUrl: 'http://old.local',
      proxy: { server: 'http://p:1', bypass: [] },
      cellsPending: 1,
    });
    const bare = s.environments.repo.create({ projectId, name: 'Bare', cellsPending: 1 });
    s.environments.backfillCells();
    expect(s.environments.cell(old.id, web.id)).toMatchObject({
      url: 'http://old.local',
      proxy: { server: 'http://p:1' },
    });
    expect(s.environments.repo.get(old.id)).toMatchObject({ cellsPending: 0, baseUrl: null });
    // Every old environment keeps the product available (empty URL to fill in).
    expect(s.environments.cell(bare.id, web.id)).toMatchObject({ url: null });
    s.environments.setCell(bare.id, web.id, null);
    s.environments.backfillCells();
    expect(s.environments.cell(bare.id, web.id)).toBeUndefined();
  });

  it('type, colour and protection: Production is protected by default, copied on duplicate [O-03, W-10]', () => {
    const { s, projectId } = setup();
    const prod = s.environments.create({ projectId, name: 'Production', type: 'production' });
    expect(prod).toMatchObject({ type: 'production', protected: true, color: null });
    const dev = s.environments.create({ projectId, name: 'DEV', type: 'dev', color: '#00AA00' });
    expect(dev.protected).toBe(false);
    expect(s.environments.update(dev.id, { type: 'production' }).protected).toBe(true);
    expect(s.environments.update(dev.id, { protected: false }).protected).toBe(false);
    expect(() => s.environments.update(dev.id, { color: 'red' })).toThrow(DbError);
    expect(s.environments.forRun(prod.id).env).toMatchObject({
      type: 'production',
      protected: true,
    });
    expect(s.environments.duplicate(prod.id, 'Prod 2')).toMatchObject({
      type: 'production',
      protected: true,
    });
  });
});

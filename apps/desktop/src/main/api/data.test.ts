import { createMemoryServices, writeCsv } from '@kiemi/db';
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
  };
}

describe('data routers [M2-02 → M2-05]', () => {
  it('creates and lists folders and tests', async () => {
    const { c, projectId } = caller();
    const f = await c.folders.create({ projectId, name: 'Nghỉ phép' });
    const t = await c.testCases.create({ projectId, folderId: f.id, name: 'Tạo đơn' });
    expect(await c.testCases.list({ projectId, folderId: f.id })).toMatchObject([
      { id: t.id, stepCount: 0 },
    ]);
    const saved = await c.testCases.save({
      id: t.id,
      version: t.version,
      content: { ...t.content, steps: [{ id: 's1', action: 'goto', params: { url: '/' } }] },
    });
    expect(saved.version).toBe(2);
  });

  it('maps data errors to tRPC codes with a Kiemi code for the UI', async () => {
    const { c, projectId } = caller();
    const t = await c.testCases.create({ projectId, name: 'X' });
    await c.testCases.rename({ id: t.id, name: 'Y', version: 1 });
    await expect(c.testCases.rename({ id: t.id, name: 'Z', version: 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(c.testCases.get({ id: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(c.projects.create({ name: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('explains the effective value of each variable and its level [O-04]', async () => {
    const { c, projectId } = caller();
    const [web] = await c.products.list({ projectId });
    const env = await c.environments.create({ projectId, name: 'UAT' });
    await c.environments.setVariables({ id: env.id, variables: { timeout: '20' } });
    await c.projects.setVariables({ id: projectId, variables: { timeout: '15', lang: 'vi' } });
    await c.products.setVariables({ id: web?.id as string, variables: { lang: 'en' } });
    await c.system.updateSettings({ workspaceVariables: { company: 'ACME' } });
    const t = await c.testCases.create({ projectId, name: 'T' });
    await c.testCases.save({ id: t.id, content: { ...t.content, variables: { who: 'test' } } });
    await c.environments.setSecret({ id: env.id, name: 'pass', value: 'S3cret!' });
    const list = await c.testCases.effectiveVariables({ testCaseId: t.id, environmentId: env.id });
    expect(list.map((v) => [v.name, v.value, v.level])).toEqual([
      ['company', 'ACME', 'workspace'],
      ['lang', 'en', 'product'],
      ['timeout', '20', 'environment'],
      ['who', 'test', 'test'],
    ]);
    expect(JSON.stringify(list)).not.toContain('S3cret');
    const none = await c.testCases.effectiveVariables({ testCaseId: t.id, environmentId: null });
    expect(none.find((v) => v.name === 'timeout')?.level).toBe('project');
  });

  it('never returns secret values', async () => {
    const { c, projectId } = caller();
    const [env] = await c.environments.list({ projectId });
    await c.environments.setSecret({ id: env?.id as string, name: 'pass', value: 'SECRET-123' });
    const view = await c.environments.get({ id: env?.id as string });
    expect(JSON.stringify(view)).not.toContain('SECRET-123');
    expect(view.secrets.map((s) => s.name)).toEqual(['pass']);
  });

  it('imports a CSV file and round-trips a project bundle as base64', async () => {
    const { c, projectId } = caller();
    const data = Buffer.from(writeCsv({ columns: ['ma'], rows: [{ ma: 'A1' }] })).toString(
      'base64',
    );
    const ds = await c.datasets.importFile({ projectId, name: 'D', fileName: 'd.csv', data });
    expect(ds.rows).toEqual([{ ma: 'A1' }]);
    await c.testCases.create({ projectId, name: 'T' });
    const bundle = await c.io.exportBundle({ projectId });
    const report = await c.io.importBundle({ data: bundle.data, projectName: 'Bản sao' });
    expect(await c.testCases.list({ projectId: report.projectId })).toHaveLength(1);
    const one = await c.io.exportTest({
      id: (await c.testCases.list({ projectId }))[0]?.id as string,
    });
    expect(JSON.parse(one.content)).toMatchObject({ schemaVersion: 2, name: 'T' });
  });
});

describe('workspace search index [O-08]', () => {
  it('lists tests, elements and shared steps of every project plus the library', async () => {
    const { c, projectId } = caller();
    const other = await c.projects.create({ name: 'Cổng B' });
    await c.testCases.create({ projectId, name: 'Đăng nhập A' });
    await c.testCases.create({ projectId: other.id, name: 'Đăng nhập B' });
    await c.sharedResources.create({
      kind: 'shared_step',
      scope: 'workspace',
      name: 'Chung',
      data: { params: [], steps: [{ id: 's', action: 'goto', params: { url: '/' } }] },
    });
    const idx = await c.search.index();
    expect(idx.projects).toHaveLength(2);
    expect(idx.tests.map((t) => [t.name, t.projectName]).sort()).toEqual([
      ['Đăng nhập A', expect.any(String)],
      ['Đăng nhập B', 'Cổng B'],
    ]);
    expect(idx.sharedSteps).toMatchObject([{ name: 'Chung', projectId: null }]);
  });
});

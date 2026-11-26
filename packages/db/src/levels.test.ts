import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { attachProjectFolder, openProjectFolder } from './folder';
import { createServices, ensureDefaultWorkspace } from './services';
import { createMemoryServices, fakeCipher } from './testing';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('variable levels and data per environment [O-04, O-05]', () => {
  it('project / product / workspace variables are stored and validated', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    s.projects.setVariables(projectId, { lang: 'vi' });
    const web = s.products.defaultFor(projectId);
    s.products.setVariables(web.id, { timeout: '15' });
    s.settings.update({ workspaceVariables: { company: 'ACME' } });
    expect(s.projects.get(projectId).variables).toEqual({ lang: 'vi' });
    expect(s.products.get(web.id).variables).toEqual({ timeout: '15' });
    expect(s.settings.getAll().workspaceVariables).toEqual({ company: 'ACME' });
    expect(() => s.projects.setVariables(projectId, { 'bad-name': 'x' })).toThrow();
  });

  it('a saved dataset can have its own rows on one environment', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const uat = s.environments.create({ projectId, name: 'UAT' });
    const dev = s.environments.create({ projectId, name: 'DEV' });
    const ds = s.datasets.create({
      projectId,
      name: 'NV',
      columns: ['ma'],
      rows: [{ ma: 'nv001' }],
    });
    s.datasets.setEnvironmentRows(ds.id, dev.id, [{ ma: 'test01' }, { ma: 'test02' }]);
    expect(s.datasets.forRun(ds.id, uat.id).rows).toEqual([{ ma: 'nv001' }]);
    expect(s.datasets.forRun(ds.id, dev.id).rows).toEqual([{ ma: 'test01' }, { ma: 'test02' }]);
    expect(s.datasets.forRun(ds.id).rows).toEqual([{ ma: 'nv001' }]);
    expect(() => s.datasets.setEnvironmentRows(ds.id, dev.id, [{ other: 'x' }])).toThrow();
    s.datasets.setEnvironmentRows(ds.id, dev.id, null);
    expect(s.datasets.get(ds.id).envRows).toBeNull();
  });

  it('project/product variables and per-environment rows travel through the project folder', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const env = s.environments.list(projectId)[0] as { id: string };
    s.projects.setVariables(projectId, { lang: 'vi' });
    const web = s.products.defaultFor(projectId);
    s.products.setVariables(web.id, { timeout: '15' });
    const ds = s.datasets.create({ projectId, name: 'NV', columns: ['ma'], rows: [{ ma: 'a' }] });
    s.datasets.setEnvironmentRows(ds.id, env.id, [{ ma: 'b' }]);
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-levels-'));
    dirs.push(dir);
    attachProjectFolder(s, projectId, dir);

    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.projects.get(projectId).variables).toEqual({ lang: 'vi' });
    expect(other.products.get(web.id).variables).toEqual({ timeout: '15' });
    expect(other.datasets.forRun(ds.id, env.id).rows).toEqual([{ ma: 'b' }]);
  });
});

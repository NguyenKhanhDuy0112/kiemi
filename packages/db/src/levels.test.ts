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

  it('popup rules of a project are validated and travel through the project folder [W-09]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const rule = {
      id: 'cookie',
      name: 'Banner cookie',
      when: { strategies: [{ kind: 'text', value: 'Chấp nhận cookie' }] },
      action: { kind: 'click', target: { strategies: [{ kind: 'text', value: 'Đồng ý' }] } },
    };
    s.projects.setPopupRules(projectId, [rule]);
    expect(s.projects.popupRules(projectId)[0]).toMatchObject({ id: 'cookie', enabled: true });
    expect(() => s.projects.setPopupRules(projectId, [{ id: 'x' }])).toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-popup-'));
    dirs.push(dir);
    attachProjectFolder(s, projectId, dir);
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.projects.popupRules(projectId)).toEqual(s.projects.popupRules(projectId));
  });

  it('finds and replaces the same element in every test of the project [FX-08]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const strategies = [{ kind: 'css' as const, value: '#save' }];
    const make = (name: string, elName = 'Nút Lưu', value = '#save') => {
      const t = s.testCases.create({ projectId, name });
      s.testCases.save(t.id, {
        ...t.content,
        elements: { el_save: { name: elName, strategies: [{ kind: 'css', value }] } },
        steps: [{ id: 's1', action: 'click', params: { target: { ref: 'el_save' } } }],
      });
      return t.id;
    };
    const a = make('A');
    const b = make('B');
    make('C', 'Nút Lưu', '#other');
    make('D', 'Nút Xóa');
    expect(s.testCases.usersOfElement(projectId, 'Nút Lưu', strategies).map((u) => u.id)).toEqual([
      a,
      b,
    ]);
    const next = { strategies: [{ kind: 'css' as const, value: '#btn-save' }] };
    expect(s.testCases.replaceElement(projectId, 'Nút Lưu', strategies, next, a)).toEqual([b]);
    expect(s.testCases.get(b).content.elements.el_save?.strategies).toEqual(next.strategies);
    expect(s.testCases.get(a).content.elements.el_save?.strategies).toEqual(strategies);
  });

  it('form specs of a project are validated and travel through the project folder [R-01]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const form = {
      id: 'reg',
      name: 'Đăng ký',
      fields: [
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'pw', label: 'Mật khẩu', type: 'password', minLength: 8 },
      ],
    };
    s.projects.setFormSpecs(projectId, [form]);
    expect(s.projects.formSpecs(projectId)[0]?.fields[1]).toMatchObject({
      key: 'pw',
      minLength: 8,
    });
    expect(() => s.projects.setFormSpecs(projectId, [{ id: 'x', name: '', fields: [] }])).toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-formspec-'));
    dirs.push(dir);
    attachProjectFolder(s, projectId, dir);
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.projects.formSpecs(projectId)).toEqual(s.projects.formSpecs(projectId));
  });
});

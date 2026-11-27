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

  it('message catalog of a project travels through the project folder [R-10]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    s.projects.setMessageCatalog(projectId, { required: 'Vui lòng nhập {field}' });
    expect(() => s.projects.setMessageCatalog(projectId, { required: '' })).toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-catalog-'));
    dirs.push(dir);
    attachProjectFolder(s, projectId, dir);
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.projects.messageCatalog(projectId)).toEqual({ required: 'Vui lòng nhập {field}' });
  });

  it('named formulas of a project travel through the project folder [P-03]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const formulas = { TongDon: { params: ['ds', 'giam'], expression: "SUM(ds, 'tt') - giam" } };
    s.projects.setFormulas(projectId, formulas);
    expect(() =>
      s.projects.setFormulas(projectId, { '1x': { params: [], expression: '1' } }),
    ).toThrow();
    expect(() =>
      s.projects.setFormulas(projectId, {
        A: { params: [], expression: '1' },
        a: { params: [], expression: '2' },
      }),
    ).toThrow(/Invalid formulas/);
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-formulas-'));
    dirs.push(dir);
    attachProjectFolder(s, projectId, dir);
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.projects.formulas(projectId)).toEqual(formulas);
  });

  it('manual cases of a project travel through the project folder [T-03]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const cases = [
      {
        id: 'mc1',
        name: 'Đăng nhập sai mật khẩu',
        group: 'Đăng nhập',
        preconditions: '',
        priority: 'high' as const,
        steps: [
          {
            id: 's1',
            action: 'Nhập sai mật khẩu',
            expected: 'Báo lỗi',
            status: 'fail' as const,
            actual: 'Không báo',
            attachments: [],
          },
        ],
      },
    ];
    s.projects.setManualCases(projectId, cases);
    expect(() => s.projects.setManualCases(projectId, [{ id: 'x', name: '' }])).toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-manual-'));
    dirs.push(dir);
    attachProjectFolder(s, projectId, dir);
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.projects.manualCases(projectId)).toEqual(cases);
  });

  it('test plans of a project travel through the project folder [T-02]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const plans = [
      {
        id: 'pl1',
        name: 'Đợt 1',
        release: '3.2',
        product: 'web',
        items: [
          {
            id: 'i1',
            kind: 'manual' as const,
            refId: 'mc1',
            name: 'A',
            assignee: 'An',
            status: 'pass' as const,
            note: '',
          },
        ],
      },
    ];
    s.projects.setTestPlans(projectId, plans);
    expect(() => s.projects.setTestPlans(projectId, [{ id: 'x', name: '' }])).toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-plans-'));
    dirs.push(dir);
    attachProjectFolder(s, projectId, dir);
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.projects.testPlans(projectId)).toEqual(plans);
  });

  it('requirements of a project travel through the project folder [T-04]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const reqs = [{ key: 'HR-1', title: 'Tạo đơn', url: 'https://x.example/HR-1' }];
    s.projects.setRequirements(projectId, reqs);
    expect(() => s.projects.setRequirements(projectId, [{ key: 'a b' }])).toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-reqs-'));
    dirs.push(dir);
    attachProjectFolder(s, projectId, dir);
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.projects.requirements(projectId)).toEqual(reqs);
  });

  it('permission matrices of a project travel through the project folder [Q-09]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const matrices = [
      {
        id: 'pm1',
        name: 'Phân quyền',
        homePath: '/',
        loginPath: '/login.html',
        usernameLabel: 'Tên đăng nhập',
        passwordLabel: 'Mật khẩu',
        loginButton: 'Đăng nhập',
        deniedText: 'Bạn không có quyền',
        roles: [{ key: 'qly', name: 'Quản lý', username: 'quanly', password: '{{pw}}' }],
        functions: [{ key: 'luong', name: 'Bảng lương', path: '/luong' }],
        cells: { 'qly|luong': 'see' as const },
      },
    ];
    s.projects.setPermissionMatrices(projectId, matrices);
    expect(() => s.projects.setPermissionMatrices(projectId, [{ id: 'x', name: '' }])).toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-perm-'));
    dirs.push(dir);
    attachProjectFolder(s, projectId, dir);
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.projects.permissionMatrices(projectId)).toEqual(matrices);
  });

  it('declared pages of a project travel through the project folder [CV-02]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    s.projects.setPages(projectId, [{ id: 'p1', name: 'Đăng ký', path: '/dang-ky', kind: 'form' }]);
    expect(() => s.projects.setPages(projectId, [{ id: 'p', name: '', path: '/' }])).toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-pages-'));
    dirs.push(dir);
    attachProjectFolder(s, projectId, dir);
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.projects.pages(projectId)).toEqual(s.projects.pages(projectId));
  });
});

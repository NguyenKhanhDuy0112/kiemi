import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryServices, writeCsv } from '@kiemi/db';
import Database from 'better-sqlite3';
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

describe('formulas router [P-03]', () => {
  it('explains a formula step by step and reports errors instead of throwing', async () => {
    const { c } = caller();
    const formulas = { Vat: { params: ['x'], expression: 'ROUND(x * 1.08)' } };
    const ok = await c.formulas.explain({
      expression: 'Vat(SUM(ds, "tt"))',
      formulas,
      values: { ds: '[{"tt":"100"},{"tt":"150"}]' },
    });
    expect(ok).toMatchObject({ ok: true, value: '270' });
    expect(ok.ok && ok.steps.map((s) => s.value)).toContain('250');
    const bad = await c.formulas.explain({ expression: 'Vat()', formulas, values: {} });
    expect(bad).toMatchObject({ ok: false, error: expect.stringContaining('takes 1 input') });
  });
});

describe('manual router [X-08]', () => {
  it('previews the sample file and follows a chosen column mapping', async () => {
    const { c } = caller();
    const t = await c.manual.template();
    const guess = await c.manual.preview({ data: t.data });
    expect(guess.cases.map((x) => x.externalId)).toEqual(['TC-001', 'TC-002']);
    expect(guess.mapping.name).toBe('Tên case');
    const none = await c.manual.preview({ data: t.data, mapping: { action: 'Bước thực hiện' } });
    expect(none.cases).toEqual([]);
    expect(none.warnings[0]).toMatch(/Tên case/);
  });
});

describe('reports router [X-01]', () => {
  it('writes a workbook from sheets, and PDF needs the desktop app', async () => {
    const { c } = caller();
    const r = await c.reports.workbook({
      sheets: [
        { name: 'Tổng hợp', columns: ['Test', 'Kết quả'], rows: [['A', 'Đạt']] },
        { name: 'Chi tiết', columns: ['x'], rows: [] },
      ],
    });
    // .xlsx is a zip file
    expect(Buffer.from(r.data, 'base64').subarray(0, 2).toString()).toBe('PK');
    await expect(c.reports.pdf({ html: '<p>x</p>' })).rejects.toThrow(/desktop/);
  });
});

describe('dbQuery router [X-05]', () => {
  it('tests a SQLite connection and explains a missing secret or file', async () => {
    const { c } = caller();
    const projectId = (await c.projects.list())[0]?.id ?? '';
    const env = await c.environments.create({ projectId, name: 'UAT', baseUrl: 'http://x' });
    const dir = mkdtempSync(join(tmpdir(), 'kiemi-dbtest-'));
    const file = join(dir, 'a.db');
    new Database(file).close();
    const ok = await c.dbQuery.test({
      environmentId: env.id,
      connection: { name: 'qa', kind: 'sqlite', database: file, ssl: false },
    });
    expect(ok).toEqual({ ok: true, message: 'Kết nối được' });
    const missing = await c.dbQuery.test({
      environmentId: env.id,
      connection: { name: 'qa', kind: 'sqlite', database: join(dir, 'none.db'), ssl: false },
    });
    expect(missing.ok).toBe(false);
    const noSecret = await c.dbQuery.test({
      environmentId: env.id,
      connection: {
        name: 'p',
        kind: 'postgres',
        host: 'h',
        database: 'd',
        passwordSecret: 'DB_PW',
        ssl: false,
      },
    });
    expect(noSecret).toEqual({ ok: false, message: 'Chưa nhập giá trị cho bí mật “DB_PW”' });
  });
});

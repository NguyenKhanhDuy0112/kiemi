import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import {
  attachProjectFolder,
  filesToSnapshot,
  openProjectFolder,
  readProjectFiles,
  readSnapshot,
  snapshotToFiles,
  syncProjectFolder,
} from './folder';
import { createServices, ensureDefaultWorkspace, type Services } from './services';
import { createMemoryServices, fakeCipher } from './testing';

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'kiemi-folder-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A second "machine": its own database. */
function machine(): Services {
  const db = openDatabase({ path: ':memory:' });
  const seed = ensureDefaultWorkspace(db);
  return createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
}

function sample() {
  const { services: s, defaultProjectId: projectId } = createMemoryServices();
  const folder = s.folders.create({ projectId, name: 'Nghỉ phép' });
  const sub = s.folders.create({ projectId, parentId: folder.id, name: 'Duyệt' });
  s.folders.create({ projectId, name: 'Trống' });
  const login = s.sharedSteps.create({
    projectId,
    name: 'Đăng nhập',
    params: ['user'],
    steps: [{ id: 'l1', action: 'goto', params: { url: '/login' } }],
  });
  const t = s.testCases.create({ projectId, folderId: sub.id, name: 'Tạo / duyệt: đơn?' });
  s.testCases.save(t.id, {
    ...t.content,
    steps: [{ id: 's1', action: 'call', params: { shared: login.id, args: { user: 'an' } } }],
  });
  const t2 = s.testCases.create({ projectId, name: 'Đơn khác' });
  const env = s.environments.list(projectId)[0] as { id: string };
  s.environments.update(env.id, { baseUrl: 'https://uat.example.com' });
  s.environments.setVariables(env.id, { portal: 'https://p' });
  s.environments.setSecret(env.id, 'nvPass', 'TOP-SECRET');
  const ds = s.datasets.create({
    projectId,
    name: 'Dữ liệu',
    columns: ['ma'],
    rows: [{ ma: 'A1' }],
  });
  const suite = s.suites.create({ projectId, name: 'Hồi quy', environmentId: env.id });
  s.suites.setItems(suite.id, [{ testCaseId: t.id, datasetId: ds.id }, { testCaseId: t2.id }]);
  s.elements.create({
    projectId,
    name: 'Nút Lưu',
    locator: { strategies: [{ kind: 'role', role: 'button', name: 'Lưu' }] },
  });
  return { s, projectId, t, t2, env, suite };
}

const read = (dir: string, rel: string) => readFileSync(join(dir, ...rel.split('/')), 'utf8');

describe('project folder format [T-01, O-11]', () => {
  it('round-trips: DB → files → snapshot gives the same project', () => {
    const { s, projectId } = sample();
    const snap = readSnapshot(s, projectId);
    const files = snapshotToFiles(snap);
    const back = filesToSnapshot(files);
    expect(back.problems).toEqual([]);
    expect(snapshotToFiles(back.snapshot)).toEqual(files);
  });

  it('is stable and readable: same data → same text, test files named after the test', () => {
    const { s, projectId } = sample();
    const a = snapshotToFiles(readSnapshot(s, projectId));
    const b = snapshotToFiles(readSnapshot(s, projectId));
    expect(a).toEqual(b);
    expect([...a.keys()].sort()).toEqual(
      [
        '.kiemi/datasets/Dữ liệu.json',
        '.kiemi/elements.json',
        '.kiemi/environments.json',
        '.kiemi/folders.json',
        '.kiemi/project.json',
        '.kiemi/shared-steps/Đăng nhập.json',
        '.kiemi/suites/Hồi quy.json',
        'tests/Nghỉ phép/Duyệt/Tạo duyệt đơn.kiemi.json',
        'tests/Đơn khác.kiemi.json',
      ].sort(),
    );
    for (const text of a.values()) {
      expect(text.endsWith('\n')).toBe(true);
      expect(text).not.toMatch(/updatedAt|createdAt/);
    }
  });

  it('never writes secret values, only names [O-11]', () => {
    const { s, projectId } = sample();
    const files = snapshotToFiles(readSnapshot(s, projectId));
    const all = [...files.values()].join('\n');
    expect(all).not.toContain('TOP-SECRET');
    expect(files.get('.kiemi/environments.json')).toContain('"nvPass"');
  });
});

describe('attach / open / sync', () => {
  it('moves a database project into a folder and opens it on another machine', () => {
    const { s, projectId, t, env } = sample();
    const dir = join(tempDir(), 'Dự án');
    const r = attachProjectFolder(s, projectId, dir);
    expect(r.conflicts).toEqual([]);
    expect(existsSync(join(dir, 'tests', 'Trống'))).toBe(true); // empty folder kept
    expect(read(dir, '.kiemi/.gitignore')).toBe('local/\n');

    const other = machine();
    const opened = openProjectFolder(other, dir);
    expect(opened.projectId).toBe(projectId);
    // Same ids: runs, secrets, suites keep pointing at the right rows.
    expect(other.testCases.get(t.id).name).toBe('Tạo / duyệt: đơn?');
    expect(other.suites.get(other.suites.list(projectId)[0]?.id as string).items).toHaveLength(2);
    expect(
      other.folders
        .list(projectId)
        .map((f) => f.name)
        .sort(),
    ).toEqual(['Duyệt', 'Nghỉ phép', 'Trống'].sort());
    // Secret value stays on the first machine: asked again here.
    expect(opened.missingSecrets).toEqual([{ environment: 'Mặc định', names: ['nvPass'] }]);
    expect(other.environments.get(env.id).variables).toEqual({ portal: 'https://p' });
    // Nothing to write right after opening.
    expect(syncProjectFolder(other, projectId)).toMatchObject({ written: [], loaded: [] });
  });

  it('local edits are written, unchanged files are not touched', () => {
    const { s, projectId, t } = sample();
    const dir = tempDir();
    attachProjectFolder(s, projectId, dir);
    s.testCases.rename(t.id, 'Duyệt đơn');
    const r = syncProjectFolder(s, projectId);
    expect(r.written).toEqual(['tests/Nghỉ phép/Duyệt/Duyệt đơn.kiemi.json']);
    expect(r.deleted).toEqual(['tests/Nghỉ phép/Duyệt/Tạo duyệt đơn.kiemi.json']);
    expect(syncProjectFolder(s, projectId)).toMatchObject({ written: [], deleted: [] });
  });

  it('changes made on disk by a teammate are loaded (edit, add, delete, CRLF)', () => {
    const { s, projectId, t, t2 } = sample();
    const dir = tempDir();
    attachProjectFolder(s, projectId, dir);
    // Teammate edits a test (Windows line endings), adds a folder + test, deletes one.
    const path = 'tests/Nghỉ phép/Duyệt/Tạo duyệt đơn.kiemi.json';
    const doc = JSON.parse(read(dir, path));
    doc.steps.push({ id: 's2', action: 'goto', params: { url: '/x' } });
    writeFileSync(
      join(dir, ...path.split('/')),
      JSON.stringify(doc, null, 2).replace(/\n/g, '\r\n'),
    );
    mkdirSync(join(dir, 'tests', 'Mới'));
    writeFileSync(
      join(dir, 'tests', 'Mới', 'a.kiemi.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: '01890000-0000-7000-8000-000000000001',
        name: 'Mới tạo',
      }),
    );
    rmSync(join(dir, 'tests', 'Đơn khác.kiemi.json'));

    const r = syncProjectFolder(s, projectId);
    expect(r.conflicts).toEqual([]);
    expect(s.testCases.get(t.id).content.steps).toHaveLength(2);
    expect(s.testCases.repo.find(t2.id)).toBeUndefined();
    const created = s.testCases.get('01890000-0000-7000-8000-000000000001');
    expect(s.folders.repo.get(created.folderId as string).name).toBe('Mới');
    // Normalized back: file renamed after its test name, folders.json gains the new folder.
    expect(existsSync(join(dir, 'tests', 'Mới', 'Mới tạo.kiemi.json'))).toBe(true);
    expect(existsSync(join(dir, 'tests', 'Mới', 'a.kiemi.json'))).toBe(false);
    expect(read(dir, '.kiemi/folders.json')).toContain('"Mới"');
    expect(syncProjectFolder(s, projectId)).toMatchObject({ written: [], loaded: [], deleted: [] });
  });

  it('a file changed on both sides is a conflict until the user picks a side', () => {
    const { s, projectId, t } = sample();
    const dir = tempDir();
    attachProjectFolder(s, projectId, dir);
    const path = 'tests/Nghỉ phép/Duyệt/Tạo duyệt đơn.kiemi.json';
    const doc = JSON.parse(read(dir, path));
    writeFileSync(join(dir, ...path.split('/')), JSON.stringify({ ...doc, description: 'disk' }));
    const row = s.testCases.get(t.id);
    s.testCases.save(t.id, { ...row.content, description: 'app' });

    const r = syncProjectFolder(s, projectId);
    expect(r.conflicts).toEqual([path]);
    expect(JSON.parse(read(dir, path)).description).toBe('disk'); // untouched
    expect(s.testCases.get(t.id).description).toBe('app');
    // Still a conflict next time.
    expect(syncProjectFolder(s, projectId).conflicts).toEqual([path]);

    const done = syncProjectFolder(s, projectId, { resolve: { [path]: 'remote' } });
    expect(done.conflicts).toEqual([]);
    expect(s.testCases.get(t.id).description).toBe('disk');
    expect(syncProjectFolder(s, projectId).conflicts).toEqual([]);
  });

  it('a broken file (half-merged) is left alone and the test is kept', () => {
    const { s, projectId, t } = sample();
    const dir = tempDir();
    attachProjectFolder(s, projectId, dir);
    const path = 'tests/Nghỉ phép/Duyệt/Tạo duyệt đơn.kiemi.json';
    writeFileSync(join(dir, ...path.split('/')), '<<<<<<< HEAD\n{');
    const r = syncProjectFolder(s, projectId);
    expect(r.problems).toEqual([{ path, reason: 'badJson' }]);
    expect(s.testCases.get(t.id).name).toBe('Tạo / duyệt: đơn?');
    expect(read(dir, path)).toBe('<<<<<<< HEAD\n{');
  });

  it('recovers edits not yet written when the app stopped', () => {
    const { s, projectId, t } = sample();
    const dir = tempDir();
    attachProjectFolder(s, projectId, dir);
    s.testCases.rename(t.id, 'Chưa kịp ghi');
    // "Restart": the next sync sees local ≠ base and disk = base → writes.
    const r = syncProjectFolder(s, projectId);
    expect(r.written).toContain('tests/Nghỉ phép/Duyệt/Chưa kịp ghi.kiemi.json');
    expect(r.loaded).toEqual([]);
  });

  it('refuses a second folder for the same project and a non-project folder', () => {
    const { s, projectId } = sample();
    const dir = tempDir();
    attachProjectFolder(s, projectId, dir);
    const copy = tempDir();
    for (const [rel, text] of readProjectFiles(dir)) {
      mkdirSync(join(copy, ...rel.split('/').slice(0, -1)), { recursive: true });
      writeFileSync(join(copy, ...rel.split('/')), text);
    }
    expect(() => openProjectFolder(s, copy)).toThrow(
      expect.objectContaining({ code: 'PROJECT_ALREADY_OPEN' }),
    );
    expect(() => openProjectFolder(s, tempDir())).toThrow(
      expect.objectContaining({ code: 'FOLDER_INVALID' }),
    );
    expect(() => attachProjectFolder(s, projectId, copy)).toThrow(
      expect.objectContaining({ code: 'FOLDER_INVALID' }),
    );
  });

  it('a test file copied from another project gets a new id there', () => {
    const a = sample();
    const dirA = tempDir();
    attachProjectFolder(a.s, a.projectId, dirA);
    const b = a.s.projects.create({ name: 'Dự án B' });
    const dirB = tempDir();
    attachProjectFolder(a.s, b.id, dirB);
    writeFileSync(join(dirB, 'tests', 'chép.kiemi.json'), read(dirA, 'tests/Đơn khác.kiemi.json'));
    syncProjectFolder(a.s, b.id);
    const inB = a.s.testCases.list(b.id);
    expect(inB).toHaveLength(1);
    expect(inB[0]?.id).not.toBe(a.t2.id);
    expect(a.s.testCases.get(a.t2.id).projectId).toBe(a.projectId);
  });

  it('secret removed by a teammate drops the local value; added one is reported missing', () => {
    const { s, projectId, env } = sample();
    const dir = tempDir();
    attachProjectFolder(s, projectId, dir);
    const file = join(dir, '.kiemi', 'environments.json');
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    doc.environments[0].secretNames = ['apiKey'];
    writeFileSync(file, JSON.stringify(doc));
    syncProjectFolder(s, projectId);
    expect(s.environments.listSecrets(env.id)).toEqual([]);
    expect(s.environments.missingSecrets(env.id)).toEqual(['apiKey']);
    // Entering it on this machine keeps the name in the file, never the value.
    s.environments.setSecret(env.id, 'apiKey', 'K-123');
    syncProjectFolder(s, projectId);
    expect(readFileSync(file, 'utf8')).toContain('apiKey');
    expect(readFileSync(file, 'utf8')).not.toContain('K-123');
  });
});

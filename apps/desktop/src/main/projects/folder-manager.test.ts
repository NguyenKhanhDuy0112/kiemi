import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryServices } from '@kiemi/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCaller } from '../api/root';
import { createTestRunManager } from '../run/testing';
import { ProjectFolderManager } from './folder-manager';

const dirs: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'kiemi-pf-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup() {
  const { services, defaultProjectId } = createMemoryServices();
  const root = temp();
  const onLoaded = vi.fn();
  const folders = new ProjectFolderManager({ services, root, debounceMs: 50, onLoaded });
  const c = createCaller({
    appVersion: '1',
    platform: 'darwin',
    services,
    defaultProjectId,
    runs: createTestRunManager(services),
    projectFolders: folders,
  });
  return { services, projectId: defaultProjectId, root, folders, c, onLoaded };
}

describe('project folders in the app [T-01, M9-02]', () => {
  it('moves database projects into <root>/<name> on start', () => {
    const { root, folders, projectId } = setup();
    const [status] = folders.syncAll();
    expect(status).toMatchObject({ projectId, state: 'ok', path: join(root, 'Dự án đầu tiên') });
    expect(existsSync(join(root, 'Dự án đầu tiên', '.kiemi', 'project.json'))).toBe(true);
  });

  it('writes edits shortly after each mutation', async () => {
    vi.useFakeTimers();
    const { c, folders, projectId, root } = setup();
    folders.syncAll();
    await c.testCases.create({ projectId, name: 'Đăng nhập' });
    const file = join(root, 'Dự án đầu tiên', 'tests', 'web', 'Đăng nhập.kiemi.json');
    expect(existsSync(file)).toBe(false);
    vi.advanceTimersByTime(60);
    expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('Đăng nhập');
  });

  it('a new project gets its own folder; same name → "(2)"', async () => {
    const { c, folders, root } = setup();
    mkdirSync(join(root, 'Web'));
    writeFileSync(join(root, 'Web', 'other.txt'), 'x');
    const p = await c.projects.create({ name: 'Web' });
    folders.flush();
    expect((await c.projects.folder({ id: p.id }))?.path).toBe(join(root, 'Web (2)'));
  });

  it('a missing folder is reported, edits stay in the app and are written when it is back', async () => {
    const { c, folders, projectId, root } = setup();
    folders.syncAll();
    const dir = join(root, 'Dự án đầu tiên');
    const moved = join(root, 'moved');
    rmSync(moved, { recursive: true, force: true });
    // Folder disappears (network share offline).
    renameSync(dir, moved);
    const t = await c.testCases.create({ projectId, name: 'Offline' });
    folders.flush();
    expect(await c.projects.folder({ id: projectId })).toMatchObject({ state: 'missing' });
    await expect(c.testCases.get({ id: t.id })).resolves.toMatchObject({ name: 'Offline' });
    renameSync(moved, dir);
    expect(await c.projects.syncFolder({ id: projectId })).toMatchObject({ state: 'ok' });
    expect(existsSync(join(dir, 'tests', 'web', 'Offline.kiemi.json'))).toBe(true);
  });

  it('loads changes made on disk and tells the renderer', () => {
    const { folders, projectId, root, services, onLoaded } = setup();
    folders.syncAll();
    writeFileSync(
      join(root, 'Dự án đầu tiên', 'tests', 'x.kiemi.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: '01890000-0000-7000-8000-0000000000aa',
        name: 'Từ Git',
      }),
    );
    folders.syncAll();
    expect(onLoaded).toHaveBeenCalledWith([projectId]);
    expect(services.testCases.list(projectId).map((t) => t.name)).toEqual(['Từ Git']);
  });

  it('opens a folder made on another machine', async () => {
    const a = setup();
    a.folders.syncAll();
    await a.c.testCases.create({ projectId: a.projectId, name: 'Chung' });
    a.folders.flush();

    const b = setup();
    const dir = join(a.root, 'Dự án đầu tiên');
    const status = b.folders.open(dir);
    expect(status).toMatchObject({ projectId: a.projectId, state: 'ok', path: dir });
    expect(b.services.testCases.list(a.projectId).map((t) => t.name)).toEqual(['Chung']);
  });

  it('notices a teammate editing the folder and pushes "loaded" within 5 s', async () => {
    const { folders, root, projectId, services } = setup();
    folders.syncAll();
    const ac = new AbortController();
    const events = folders.events(ac.signal);
    folders.watch();
    try {
      const dir = join(root, 'Dự án đầu tiên', 'tests');
      writeFileSync(
        join(dir, 'b.kiemi.json'),
        JSON.stringify({
          schemaVersion: 1,
          id: '01890000-0000-7000-8000-0000000000bb',
          name: 'Máy B',
        }),
      );
      const started = Date.now();
      let next = await events.next();
      while (next.value?.kind !== 'loaded') next = await events.next();
      expect(next.value).toEqual({ kind: 'loaded', projectId });
      expect(Date.now() - started).toBeLessThan(5000);
      expect(services.testCases.list(projectId).map((t) => t.name)).toEqual(['Máy B']);
    } finally {
      ac.abort();
      folders.stop();
    }
  });

  it("resolves conflicts with the user's choice through tRPC", async () => {
    const { c, folders, projectId, root } = setup();
    folders.syncAll();
    const t = await c.testCases.create({ projectId, name: 'Chung' });
    folders.flush();
    const file = join(root, 'Dự án đầu tiên', 'tests', 'web', 'Chung.kiemi.json');
    writeFileSync(
      file,
      JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), description: 'B' }),
    );
    const row = await c.testCases.get({ id: t.id });
    await c.testCases.save({ id: t.id, content: { ...row.content, description: 'A' } });
    folders.flush();
    const status = await c.projects.folder({ id: projectId });
    expect(status?.conflicts).toEqual(['tests/web/Chung.kiemi.json']);
    const done = await c.projects.resolveConflicts({
      id: projectId,
      choices: { 'tests/web/Chung.kiemi.json': 'local' },
    });
    expect(done?.conflicts).toEqual([]);
    expect(JSON.parse(readFileSync(file, 'utf8')).description).toBe('A');
  });

  it('soft locks go through tRPC without triggering a folder sync', async () => {
    const { services, projectId, root } = setup();
    const { SoftLocks } = await import('./locks');
    const folders = new ProjectFolderManager({
      services,
      root,
      locks: new SoftLocks({ user: 'an', host: 'A' }),
    });
    folders.syncAll();
    const t = services.testCases.create({ projectId, name: 'X' });
    folders.syncAll();
    const other = new SoftLocks({ user: 'binh', host: 'B' });
    other.touch(join(root, 'Dự án đầu tiên'), t.id);
    const spy = vi.spyOn(folders, 'changed');
    const c = createCaller({
      appVersion: '1',
      platform: 'darwin',
      services,
      defaultProjectId: projectId,
      runs: createTestRunManager(services),
      projectFolders: folders,
    });
    expect(await c.projects.touchLock({ testId: t.id })).toEqual({
      heldBy: expect.objectContaining({ user: 'binh', host: 'B' }),
    });
    await c.projects.releaseLock({ testId: t.id });
    expect(spy).not.toHaveBeenCalled();
  });
});

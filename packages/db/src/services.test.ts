import { describe, expect, it } from 'vitest';
import { DbError } from './repo';
import { createServices } from './services';
import { createMemoryServices, fakeCipher } from './testing';

const setup = () => createMemoryServices();
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof DbError ? e.code : String(e);
  }
  return 'no error';
};

describe('repository basics [M2-02]', () => {
  it('creates, updates with optimistic version, soft-deletes and restores', () => {
    const { services: s } = setup();
    const p = s.projects.create({ name: '  Cổng nhân sự  ' });
    expect(p).toMatchObject({ name: 'Cổng nhân sự', version: 1, deletedAt: null });
    const p2 = s.projects.update(p.id, { name: 'HR' }, 1);
    expect(p2.version).toBe(2);
    expect(code(() => s.projects.update(p.id, { name: 'X' }, 1))).toBe('VERSION_CONFLICT');
    s.projects.remove(p.id);
    expect(s.projects.list().map((x) => x.id)).not.toContain(p.id);
    expect(code(() => s.projects.get(p.id))).toBe('NOT_FOUND');
    expect(s.projects.repo.restore(p.id)).toMatchObject({
      name: 'HR',
      deletedAt: null,
      version: 4,
    });
  });

  it('validates input', () => {
    const { services: s } = setup();
    expect(code(() => s.projects.create({ name: '   ' }))).toBe('VALIDATION');
  });

  it('keeps workspaces apart', () => {
    const a = setup();
    const otherWs = { ...a.services.ctx, workspaceId: 'other' };
    const b = createServices(otherWs, fakeCipher());
    expect(b.projects.list()).toEqual([]);
    expect(a.services.projects.list()).toHaveLength(1);
  });
});

describe('folders & test cases [M2-02]', () => {
  it('builds a folder tree, refuses cycles, cascades deletes', () => {
    const { services: s, defaultProjectId: projectId } = setup();
    const a = s.folders.create({ projectId, name: 'Nghỉ phép' });
    const b = s.folders.create({ projectId, parentId: a.id, name: 'Duyệt đơn' });
    const c = s.folders.create({ projectId, name: 'Báo cáo' });
    expect([a.sortOrder, c.sortOrder, b.sortOrder]).toEqual([0, 1, 0]);
    expect(code(() => s.folders.move(a.id, b.id))).toBe('VALIDATION');
    const t = s.testCases.create({ projectId, folderId: b.id, name: 'Duyệt 1 đơn' });
    s.folders.remove(a.id);
    expect(s.folders.list(projectId).map((f) => f.name)).toEqual(['Báo cáo']);
    expect(code(() => s.testCases.get(t.id))).toBe('NOT_FOUND');
  });

  it('stores a valid .kiemi.json document and keeps columns in sync', () => {
    const { services: s, defaultProjectId: projectId } = setup();
    const t = s.testCases.create({ projectId, name: 'Đăng nhập' });
    expect(t.content).toMatchObject({ schemaVersion: 2, id: t.id, name: 'Đăng nhập', steps: [] });
    const saved = s.testCases.save(
      t.id,
      {
        ...t.content,
        name: 'Đăng nhập đúng',
        tags: ['smoke'],
        steps: [{ id: 's1', action: 'goto', params: { url: '/' } }],
      },
      t.version,
    );
    expect(saved).toMatchObject({ name: 'Đăng nhập đúng', tags: ['smoke'], version: 2 });
    expect(saved.content.steps[0]).toMatchObject({ session: 'default', enabled: true });
    expect(s.testCases.list(projectId)[0]).toMatchObject({ stepCount: 1 });
    expect(code(() => s.testCases.save(t.id, { ...t.content, schemaVersion: 99 }))).toBe(
      'VALIDATION',
    );
    expect(
      code(() =>
        s.testCases.save(t.id, {
          ...t.content,
          steps: [{ id: 's1', action: 'x', session: 'nope' }],
        }),
      ),
    ).toBe('VALIDATION');
    const copy = s.testCases.duplicate(t.id);
    expect(copy).toMatchObject({ name: 'Đăng nhập đúng (bản sao)' });
    expect(copy.content.id).toBe(copy.id);
    expect(s.testCases.list(projectId, null)).toHaveLength(2);
  });
});

describe('suites, shared steps, elements [M2-02]', () => {
  it('orders suite items and replaces them', () => {
    const { services: s, defaultProjectId: projectId } = setup();
    const t1 = s.testCases.create({ projectId, name: 'A' });
    const t2 = s.testCases.create({ projectId, name: 'B' });
    const suite = s.suites.create({ projectId, name: 'Hồi quy', variables: { lang: 'vi' } });
    s.suites.setItems(suite.id, [{ testCaseId: t2.id }, { testCaseId: t1.id, enabled: false }]);
    expect(s.suites.get(suite.id).items.map((i) => [i.testCaseId, i.sortOrder, i.enabled])).toEqual(
      [
        [t2.id, 0, true],
        [t1.id, 1, false],
      ],
    );
    s.suites.setItems(suite.id, [{ testCaseId: t1.id }]);
    expect(s.suites.get(suite.id).items).toHaveLength(1);
    expect(
      code(() => s.suites.create({ projectId, name: 'x', variables: { 'bad name': 'v' } })),
    ).toBe('VALIDATION');
  });

  it('stores shared steps for the engine and validates elements', () => {
    const { services: s, defaultProjectId: projectId } = setup();
    const sh = s.sharedSteps.create({
      projectId,
      name: 'Đăng nhập',
      params: ['user'],
      steps: [{ id: 'l1', action: 'fill', params: { value: '{{param.user}}' } }],
    });
    expect(s.sharedSteps.forRun(projectId)).toEqual([
      {
        id: sh.id,
        name: 'Đăng nhập',
        params: ['user'],
        steps: [expect.objectContaining({ id: 'l1', session: 'default' })],
      },
    ]);
    expect(code(() => s.sharedSteps.create({ projectId, name: 'x', params: [], steps: [] }))).toBe(
      'VALIDATION',
    );
    const el = s.elements.create({
      projectId,
      name: 'Nút Lưu',
      locator: { strategies: [{ kind: 'role', role: 'button', name: 'Lưu' }] },
    });
    expect(el.locator.strategies).toHaveLength(1);
    expect(
      code(() => s.elements.create({ projectId, name: 'x', locator: { strategies: [] } })),
    ).toBe('VALIDATION');
  });
});

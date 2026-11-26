import type { Step } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { DbError } from './repo';
import { createMemoryServices } from './testing';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof DbError ? e.code : String(e);
  }
  return 'no error';
};

const click: Step = {
  id: 's1',
  action: 'click',
  params: {},
  session: 'default',
  enabled: true,
  mode: 'hard',
};

describe('shared resources [O-07]', () => {
  it('stores workspace library steps and hands them to runs', () => {
    const { services: s } = createMemoryServices();
    const r = s.sharedResources.create({
      kind: 'shared_step',
      scope: 'workspace',
      name: 'Đăng nhập',
      data: { params: ['user'], steps: [click] },
    });
    expect(r).toMatchObject({ scope: 'workspace', projectId: null, productId: null });
    expect(s.sharedResources.sharedStepsForRun()).toEqual([
      { id: r.id, name: 'Đăng nhập', params: ['user'], steps: [click] },
    ]);
  });

  it('validates scope and data per kind', () => {
    const { services: s } = createMemoryServices();
    const data = { params: [], steps: [click] };
    const base = { kind: 'shared_step', name: 'x', data } as const;
    expect(code(() => s.sharedResources.create({ ...base, scope: 'project' }))).toBe('VALIDATION');
    expect(
      code(() => s.sharedResources.create({ ...base, scope: 'workspace', projectId: 'p' })),
    ).toBe('VALIDATION');
    expect(
      code(() => s.sharedResources.create({ ...base, scope: 'product', projectId: 'p' })),
    ).toBe('VALIDATION');
    expect(
      code(() => s.sharedResources.create({ ...base, scope: 'workspace', data: { steps: [] } })),
    ).toBe('VALIDATION');
    expect(
      code(() =>
        s.sharedResources.create({ kind: 'element', scope: 'workspace', name: 'e', data }),
      ),
    ).toBe('VALIDATION');
  });

  it('lists by kind and project, updates, promotes and removes', () => {
    const { services: s } = createMemoryServices();
    const p1 = s.projects.create({ name: 'A' });
    const p2 = s.projects.create({ name: 'B' });
    const data = { params: [], steps: [click] };
    const ws = s.sharedResources.create({
      kind: 'shared_step',
      scope: 'workspace',
      name: 'W',
      data,
    });
    s.sharedResources.create({
      kind: 'shared_step',
      scope: 'project',
      projectId: p1.id,
      name: 'P1',
      data,
    });
    const elem = s.sharedResources.create({
      kind: 'element',
      scope: 'workspace',
      name: 'E',
      data: { locator: { strategies: [{ kind: 'css', value: '#a' }] } },
    });
    expect(s.sharedResources.list({ projectId: p1.id }).map((r) => r.name)).toEqual([
      'E',
      'P1',
      'W',
    ]);
    expect(s.sharedResources.list({ projectId: p2.id }).map((r) => r.name)).toEqual(['E', 'W']);
    expect(s.sharedResources.list({ kind: 'element' }).map((r) => r.id)).toEqual([elem.id]);
    // Only the workspace-scoped ones reach every run.
    expect(s.sharedResources.sharedStepsForRun().map((x) => x.id)).toEqual([ws.id]);

    const upd = s.sharedResources.update(ws.id, { name: 'W2' }, 1);
    expect(upd).toMatchObject({ name: 'W2', version: 2 });
    expect(code(() => s.sharedResources.update(ws.id, { name: 'W3' }, 1))).toBe('VERSION_CONFLICT');

    const local = s.sharedSteps.create({
      projectId: p1.id,
      name: 'Local',
      params: [],
      steps: [click],
    });
    const promoted = s.sharedResources.promoteSharedStep(local);
    expect(promoted).toMatchObject({ scope: 'workspace', name: 'Local' });
    s.sharedResources.remove(promoted.id);
    expect(code(() => s.sharedResources.get(promoted.id))).toBe('NOT_FOUND');
  });
});

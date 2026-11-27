import { createMemoryServices } from '@kiemi/db';
import { describe, expect, it } from 'vitest';
import { createTestRunManager } from '../run/testing';
import { createCaller } from './root';

describe('dashboard router [O-10]', () => {
  it('goes workspace → project → product with pass rates', async () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const prod = services.products.list(p)[0];
    if (!prod) throw new Error('no default product');
    const a = services.testCases.create({ projectId: p, name: 'A', productId: prod.id });
    const b = services.testCases.create({ projectId: p, name: 'B', productId: prod.id });
    const run = services.runs.create({
      projectId: p,
      artifactDir: '/r',
      target: { kind: 'suite', suiteId: 's', name: 'S' },
    });
    const ca = services.runs.addCase({ runId: run.id, testCaseId: a.id });
    const cb = services.runs.addCase({ runId: run.id, testCaseId: b.id });
    services.runs.finishCase(ca.id, { status: 'passed', durationMs: 1 } as never);
    services.runs.finishCase(cb.id, { status: 'failed', durationMs: 1 } as never);
    services.runs.finish(run.id, 'failed');
    const c = createCaller({
      appVersion: '1',
      platform: 'darwin',
      services,
      defaultProjectId: p,
      runs: createTestRunManager(services),
    });

    const ws = await c.dashboard.overview({});
    expect(ws.level).toBe('workspace');
    expect(ws.groups[0]).toMatchObject({ key: p });
    expect(ws.total.passRate).toBe(0.5);

    const pr = await c.dashboard.overview({ projectId: p });
    expect(pr.level).toBe('project');
    expect(pr.groups[0]?.key).toBe(prod.id);
    expect(pr.failing).toEqual([{ id: b.id, name: 'B' }]);

    const pd = await c.dashboard.overview({ projectId: p, productId: prod.id });
    expect(pd.level).toBe('product');
    expect(pd.groups).toHaveLength(1);
  });
});

describe('project templates router [R-15, O-12]', () => {
  it('lists templates, creates from one and clones', async () => {
    const { services, defaultProjectId } = createMemoryServices();
    const c = createCaller({
      appVersion: '1',
      platform: 'darwin',
      services,
      defaultProjectId,
      runs: createTestRunManager(services),
    });
    expect((await c.projects.templates()).map((t) => t.key)).toContain('hrm');
    const p = await c.projects.createFromTemplate({ key: 'hrm', name: 'Lương' });
    expect(services.testCases.list(p.id).length).toBeGreaterThan(5);
    const copy = await c.projects.clone({ id: p.id, name: 'Lương 2' });
    expect(services.testCases.list(copy.id)).toHaveLength(services.testCases.list(p.id).length);
  });
});

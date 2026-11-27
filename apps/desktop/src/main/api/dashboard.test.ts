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

describe('requirement coverage router [T-04, CV-05]', () => {
  it('links tests by req: tag and uses their latest result', async () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const t = services.testCases.create({ projectId: p, name: 'Tạo đơn' });
    services.testCases.save(t.id, { ...t.content, tags: ['req:HR-1'] });
    services.projects.setRequirements(p, [
      { key: 'HR-1', title: 'Tạo đơn' },
      { key: 'HR-2', title: 'Duyệt' },
    ]);
    const run = services.runs.create({
      projectId: p,
      artifactDir: '/r',
      target: { kind: 'test', testCaseId: t.id, name: 'x' },
    });
    const c = services.runs.addCase({ runId: run.id, testCaseId: t.id });
    services.runs.finishCase(c.id, { status: 'passed', durationMs: 1 } as never);
    services.runs.finish(run.id, 'passed');
    const caller = createCaller({
      appVersion: '1',
      platform: 'darwin',
      services,
      defaultProjectId: p,
      runs: createTestRunManager(services),
    });
    const cov = await caller.coverage.requirements({ projectId: p });
    expect(cov.rows.map((r) => r.state)).toEqual(['passing', 'none']);
    expect(cov.coveredPercent).toBe(50);
  });
});

describe('trends and coverage score router [T-07, CV-09]', () => {
  it('lists flaky and slowest tests and keeps one score point per day', async () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const t = services.testCases.create({ projectId: p, name: 'Chập chờn' });
    for (const [i, st] of ['passed', 'failed', 'passed', 'failed'].entries()) {
      const run = services.runs.create({
        projectId: p,
        artifactDir: '/r',
        target: { kind: 'test', testCaseId: t.id, name: 'x' },
      });
      const c = services.runs.addCase({ runId: run.id, testCaseId: t.id });
      services.runs.finishCase(c.id, { status: st as 'passed', durationMs: 1000 * (i + 1) });
      services.runs.finish(run.id, st as 'passed');
    }
    const caller = createCaller({
      appVersion: '1',
      platform: 'darwin',
      services,
      defaultProjectId: p,
      runs: createTestRunManager(services),
    });
    const o = await caller.dashboard.overview({ projectId: p });
    expect(o.flaky.map((f) => f.name)).toEqual(['Chập chờn']);
    expect(o.slowest[0]?.avgMs).toBe(2500);

    services.projects.setPages(p, [{ id: 'pg', name: 'Home', path: '/', kind: 'other' }]);
    const a = await caller.coverage.score({ projectId: p });
    expect(a.score.pages).toBe(0);
    const b = await caller.coverage.score({ projectId: p });
    expect(b.history).toHaveLength(1);
  });
});

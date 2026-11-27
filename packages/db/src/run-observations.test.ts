import { describe, expect, it } from 'vitest';
import { createMemoryServices } from './testing';

describe('run case observations [V-06]', () => {
  it('stores the noted values with the case and reads them back', () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const t = services.testCases.create({ projectId: p, name: 'T' });
    const run = services.runs.create({
      projectId: p,
      artifactDir: '/r',
      target: { kind: 'test', testCaseId: t.id, name: 'T' },
    });
    const c = services.runs.addCase({ runId: run.id, testCaseId: t.id });
    services.runs.finishCase(c.id, {
      status: 'passed',
      durationMs: 5,
      observations: { gia: '100' },
    });
    expect(services.runs.detail(run.id).cases[0]?.observations).toEqual({ gia: '100' });
  });
});

describe('environment client certificates [W-02]', () => {
  it('are stored on the environment and given to runs', () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const env = services.environments.create({
      projectId: p,
      name: 'UAT',
      clientCerts: [{ origin: 'https://bank.example.com', pfxPath: '/c/a.pfx' }],
    });
    expect(services.environments.forRun(env.id).env.clientCerts).toEqual([
      { origin: 'https://bank.example.com', pfxPath: '/c/a.pfx' },
    ]);
  });
});

describe('test version history [T-05]', () => {
  it('keeps the replaced content, lists it newest first and restores it', () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const t = services.testCases.create({ projectId: p, name: 'A' });
    const step = (id: string) => ({ id, action: 'goto', params: { url: '/' } });
    services.testCases.save(t.id, { ...t.content, steps: [step('s1')] });
    services.testCases.save(t.id, { ...t.content, steps: [step('s1'), step('s2')] });
    // Saving the same content again keeps nothing new.
    services.testCases.save(t.id, { ...t.content, steps: [step('s1'), step('s2')] });
    const h = services.testCases.history(t.id);
    expect(h.map((x) => x.steps)).toEqual([1, 0]);
    const first = h[1];
    if (!first) throw new Error('no version');
    const row = services.testCases.restore(t.id, first.id);
    expect(row.content.steps).toHaveLength(0);
    expect(services.testCases.history(t.id)[0]?.steps).toBe(2);
  });
});

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

import { EnvSchema, TestCaseSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../actions';
import { runTestCase } from '../runner';
import { findWriteSteps } from './protection';

const tc = (steps: unknown[], cleanup: unknown[] = []) =>
  TestCaseSchema.parse({
    schemaVersion: 2,
    id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f09',
    name: 'T',
    steps,
    cleanup,
  });

describe('protected environments [W-10]', () => {
  const registry = createDefaultRegistry();

  it('finds cleanup steps and API calls that change data, nested and in shared steps', () => {
    const test = tc(
      [
        { id: 'g', action: 'api', params: { method: 'GET', url: 'http://x' } },
        {
          id: 'if1',
          action: 'if',
          params: {
            condition: { kind: 'expression', expression: 'true' },
            steps: [{ id: 'p', action: 'api', params: { method: 'POST', url: 'http://x' } }],
          },
        },
        { id: 'c', action: 'call', params: { shared: 'sh1' } },
        { id: 'off', action: 'api', enabled: false, params: { method: 'DELETE', url: 'http://x' } },
      ],
      [{ id: 'cl', action: 'clearData', params: {} }],
    );
    const found = findWriteSteps(test, registry, [
      {
        id: 'sh1',
        name: 'Xóa đơn',
        params: [],
        steps: [{ id: 'd', action: 'api', params: { method: 'delete', url: 'http://x' } }],
      } as never,
    ]);
    expect(found).toEqual([
      { stepId: 'p', action: 'api', reason: 'write' },
      { stepId: 'd', action: 'api', reason: 'write' },
      { stepId: 'cl', action: 'clearData', reason: 'cleanup' },
    ]);
    expect(
      findWriteSteps(tc([{ id: 'n', action: 'wait', params: { seconds: 0.01 } }]), registry),
    ).toEqual([]);
  });

  it('a run with write steps on a protected environment is refused before any step', async () => {
    const env = EnvSchema.parse({
      id: 'p',
      name: 'Production',
      type: 'production',
      protected: true,
    });
    const result = await runTestCase(
      {
        runId: 'r',
        testCase: tc(
          [{ id: 'n', action: 'wait', params: { seconds: 0.01 } }],
          [{ id: 'cl', action: 'wait', params: { seconds: 0.01 } }],
        ),
        env,
      },
      { registry },
    );
    expect(result.status).toBe('error');
    expect(result.error).toMatchObject({
      code: 'PROTECTED_ENVIRONMENT',
      details: { environment: 'Production', stepId: 'cl', reason: 'cleanup' },
    });
    expect(result.steps).toEqual([]);

    const readOnly = await runTestCase(
      { runId: 'r2', testCase: tc([{ id: 'n', action: 'wait', params: { seconds: 0.01 } }]), env },
      { registry },
    );
    expect(readOnly.status).toBe('passed');
  });
});

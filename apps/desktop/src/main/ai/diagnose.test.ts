import { createMemoryServices } from '@kiemi/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFix, diagnose } from './diagnose';

afterEach(() => vi.unstubAllGlobals());

const locator = (text: string) => ({ strategies: [{ kind: 'text', value: text }] });

function setup() {
  const { services, defaultProjectId: p } = createMemoryServices();
  services.aiSettings.save(
    p,
    {
      enabled: true,
      kind: 'claude',
      model: 'm',
      taskModels: {},
      baseUrl: '',
      localOnly: false,
      limitTokens: null,
      priceIn: null,
      priceOut: null,
    },
    'k',
  );
  const t = services.testCases.create({ projectId: p, name: 'Lưu đơn' });
  services.testCases.save(
    t.id,
    {
      ...t.content,
      steps: [
        { id: 's1', action: 'click', params: { target: locator('Lưu') } },
        { id: 's2', action: 'click', params: { target: locator('Lưu') } },
        { id: 's3', action: 'click', params: { target: locator('Hủy') } },
      ],
    },
    t.version,
  );
  return { services, p, id: t.id };
}

function model(answer: unknown) {
  const bodies: string[] = [];
  vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
    bodies.push(String(init.body));
    return new Response(
      JSON.stringify({
        content: [
          { type: 'text', text: typeof answer === 'string' ? answer : JSON.stringify(answer) },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
  });
  return bodies;
}

const error = { code: 'ELEMENT_NOT_FOUND', message: 'Không thấy nút "Lưu"' };

describe('diagnose a failure [AI-09, AI-10, FX-12]', () => {
  it('classifies and proposes a new locator as a diff, listing steps that share the element', async () => {
    const { services, p, id } = setup();
    const bodies = model({
      category: 'uiChanged',
      explanation: 'Nút đổi tên thành "Lưu đơn"',
      fix: { params: { target: locator('Lưu đơn') }, why: 'đổi text' },
    });
    const d = await diagnose(services, p, { testCaseId: id, stepId: 's1', error });
    expect(d.category).toBe('uiChanged');
    expect(d.fix).toMatchObject({
      stepId: 's1',
      alsoSteps: ['s2'],
      after: { target: locator('Lưu đơn') },
    });
    expect(bodies[0]).toContain('ELEMENT_NOT_FOUND');
    // Nothing changed yet.
    expect(services.testCases.get(id).content.steps[0]?.params).toEqual({ target: locator('Lưu') });
  });

  it('drops a fix that leaves the catalog or changes nothing; keeps plain text as the explanation', async () => {
    const { services, p, id } = setup();
    model({ category: 'data', explanation: 'x', fix: { params: { target: 'not a locator' } } });
    expect((await diagnose(services, p, { testCaseId: id, stepId: 's1', error })).fix).toBeNull();
    model({ category: 'flaky', explanation: 'x', fix: { params: { target: locator('Lưu') } } });
    expect((await diagnose(services, p, { testCaseId: id, stepId: 's1', error })).fix).toBeNull();
    model('Chắc là lỗi mạng');
    const d = await diagnose(services, p, {
      testCaseId: id,
      stepId: 's1',
      error: { ...error, message: 'mạng' },
    });
    expect(d.explanation).toContain('lỗi mạng');
  });

  it('applyFix changes the step, and the same-element steps only when asked; logs it', () => {
    const { services, p, id } = setup();
    const params = { target: locator('Lưu đơn') };
    const r = applyFix(services, p, { testCaseId: id, stepId: 's1', params, alsoSameTarget: true });
    expect(r.updated).toEqual(['s1', 's2']);
    const steps = services.testCases.get(id).content.steps;
    expect(steps.map((s) => (s.params as { target: unknown }).target)).toEqual([
      locator('Lưu đơn'),
      locator('Lưu đơn'),
      locator('Hủy'),
    ]);
    expect(services.aiSettings.audit(p)[0]).toMatchObject({ action: 'save', allowed: true });

    applyFix(services, p, {
      testCaseId: id,
      stepId: 's3',
      params: { target: locator('Đóng') },
      alsoSameTarget: false,
    });
    expect(services.testCases.get(id).content.steps[2]?.params).toEqual({
      target: locator('Đóng'),
    });
  });

  it('refuses a fix outside the catalog and a test of another project', () => {
    const { services, p, id } = setup();
    expect(() =>
      applyFix(services, p, {
        testCaseId: id,
        stepId: 's1',
        params: { target: 5 },
        alsoSameTarget: false,
      }),
    ).toThrow();
    expect(() =>
      applyFix(services, 'other', {
        testCaseId: id,
        stepId: 's1',
        params: {},
        alsoSameTarget: false,
      }),
    ).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import type { Step } from './step';
import type { TestCase } from './test-case';
import { diffTests } from './test-diff';

const step = (id: string, params: Record<string, unknown> = {}): Step =>
  ({ id, action: 'fill', params, session: 'default', enabled: true, mode: 'hard' }) as Step;
const test = (steps: Step[], extra: Record<string, unknown> = {}): TestCase =>
  ({
    schemaVersion: 2,
    id: 't',
    name: 'Đăng nhập',
    steps,
    cleanup: [],
    variables: {},
    tags: [],
    elements: {},
    ...extra,
  }) as unknown as TestCase;

describe('diffTests [T-05]', () => {
  it('finds added, removed, edited steps and name / other changes', () => {
    const a = test([step('s1', { value: 'a' }), step('s2'), step('s3')]);
    const b = test([step('s1', { value: 'b' }), step('s3'), step('s4')], {
      name: 'Đăng nhập 2',
      tags: ['smoke'],
    });
    const d = diffTests(a, b);
    expect(d.steps.map((c) => `${c.kind}:${c.id}`)).toEqual([
      'removed:s2',
      'changed:s1',
      'added:s4',
    ]);
    const changed = d.steps.find((c) => c.kind === 'changed');
    expect(changed && 'fields' in changed && changed.fields).toEqual(['params.value']);
    expect(d.nameChanged).toEqual({ before: 'Đăng nhập', after: 'Đăng nhập 2' });
    expect(d.otherChanges).toEqual(['tags']);
    expect(d.same).toBe(false);
  });

  it('sees a reorder and looks into nested steps', () => {
    const inner = (v: string) => step('c', { steps: [step('n1', { value: v })] });
    const d = diffTests(
      test([step('s1'), step('s2'), inner('x')]),
      test([step('s2'), step('s1'), inner('y')]),
    );
    expect(d.steps.map((c) => `${c.kind}:${c.id}`).sort()).toEqual([
      'changed:n1',
      'moved:s1',
      'moved:s2',
    ]);
    expect(diffTests(test([step('s1')]), test([step('s1')])).same).toBe(true);
  });
});

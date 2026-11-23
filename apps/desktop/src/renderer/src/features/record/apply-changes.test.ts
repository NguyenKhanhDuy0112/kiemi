import type { StepChange } from '@kiemi/recorder';
import { type Step, type TestCase, TestCaseSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { applyRecordChanges, toLocator } from './apply-changes';

const s = (id: string, value = ''): Step => ({
  id,
  action: 'fill',
  params: { value },
  session: 'default',
  enabled: true,
  mode: 'hard',
});
const doc = (ids: string[]): TestCase =>
  TestCaseSchema.parse({
    schemaVersion: 2,
    id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f17',
    name: 't',
    steps: ids.map((id) => s(id)),
  });
const ids = (d: TestCase) => d.steps.map((x) => x.id);

describe('applyRecordChanges [K-01, K-04]', () => {
  it('inserts recorded steps after the anchor, in order, and follows updates / removals', () => {
    const changes: StepChange[] = [
      { type: 'add', index: 0, step: s('r1') },
      { type: 'add', index: 1, step: s('r2', 'a') },
      { type: 'update', index: 1, step: s('r2', 'ab') },
      { type: 'add', index: 2, step: s('r3') },
      { type: 'remove', index: 2, step: s('r3') },
      { type: 'add', index: 1, step: s('r4') },
    ];
    const out = applyRecordChanges(doc(['a', 'b', 'c']), [], changes, 'a');
    expect(ids(out.doc)).toEqual(['a', 'r1', 'r4', 'r2', 'b', 'c']);
    expect(out.doc.steps[3]?.params.value).toBe('ab');
    expect(out.recorded.map((x) => x.id)).toEqual(['r1', 'r4', 'r2']);
  });

  it('records into an empty test, and at the very start when there is no anchor', () => {
    const empty = applyRecordChanges(doc([]), [], [{ type: 'add', index: 0, step: s('r1') }], null);
    expect(ids(empty.doc)).toEqual(['r1']);
    const first = applyRecordChanges(
      doc(['a']),
      [],
      [{ type: 'add', index: 0, step: s('r1') }],
      null,
    );
    expect(ids(first.doc)).toEqual(['r1', 'a']);
  });
});

describe('toLocator [C-06]', () => {
  it('expands shorthand targets and saved elements', () => {
    const elements = {
      el_save: { name: 'Nút Lưu', strategies: [{ kind: 'css' as const, value: '#s' }] },
    };
    expect(toLocator({ ref: 'el_save' }, elements)).toBe(elements.el_save);
    expect(toLocator({ role: 'button', name: 'Lưu' }, {})).toEqual({
      strategies: [{ kind: 'role', role: 'button', name: 'Lưu' }],
    });
    expect(toLocator({ label: 'Email' }, {})).toEqual({
      strategies: [{ kind: 'label', value: 'Email' }],
    });
    expect(toLocator({ text: '' }, {})).toBeUndefined();
    expect(toLocator(undefined, {})).toBeUndefined();
  });
});

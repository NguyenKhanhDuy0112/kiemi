import { describe, expect, it } from 'vitest';
import { ManualCaseSchema, ManualCasesSchema, manualCaseStatus, markAll } from './manual-case';

const base = (statuses: string[]) =>
  ManualCaseSchema.parse({
    id: 'c1',
    name: 'Đăng nhập',
    steps: statuses.map((status, i) => ({ id: `s${i}`, action: 'a', expected: 'b', status })),
  });

describe('manual cases [T-03]', () => {
  it('fills defaults', () => {
    const c = ManualCaseSchema.parse({ id: 'c', name: 'x' });
    expect(c).toMatchObject({ steps: [], priority: 'medium', group: '' });
  });
  it('derives the overall result from the steps', () => {
    expect(manualCaseStatus(base([]))).toBe('untested');
    expect(manualCaseStatus(base(['pass', 'pass']))).toBe('pass');
    expect(manualCaseStatus(base(['pass', 'untested']))).toBe('untested');
    expect(manualCaseStatus(base(['pass', 'blocked']))).toBe('blocked');
    expect(manualCaseStatus(base(['blocked', 'fail']))).toBe('fail');
  });
  it('marks every step at once', () => {
    expect(manualCaseStatus(markAll(base(['fail', 'untested']), 'pass'))).toBe('pass');
  });
  it('rejects duplicate ids, non-image and oversized pictures', () => {
    expect(ManualCasesSchema.safeParse([base([]), base([])]).success).toBe(false);
    const step = (dataUrl: string) => ({
      id: 's',
      attachments: [{ name: 'a.png', dataUrl }],
    });
    expect(
      ManualCaseSchema.safeParse({ id: 'c', name: 'x', steps: [step('data:text/plain;base64,AA')] })
        .success,
    ).toBe(false);
    expect(
      ManualCaseSchema.safeParse({
        id: 'c',
        name: 'x',
        steps: [step(`data:image/png;base64,${'A'.repeat(1_600_000)}`)],
      }).success,
    ).toBe(false);
  });
});

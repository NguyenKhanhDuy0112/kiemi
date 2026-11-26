import { describe, expect, it } from 'vitest';
import { addAttachment, countCases, moveStep, newCase, newStep, patchStep } from './manual-edit';

describe('manual case editing [T-03]', () => {
  it('moves steps up and down within bounds', () => {
    let c = newCase('x');
    c = {
      ...c,
      steps: [
        { ...newStep(), action: 'a' },
        { ...newStep(), action: 'b' },
      ],
    };
    const [a, b] = c.steps;
    expect(moveStep(c, (b as { id: string }).id, -1).steps.map((s) => s.action)).toEqual([
      'b',
      'a',
    ]);
    expect(moveStep(c, (a as { id: string }).id, -1)).toBe(c);
  });
  it('limits pictures to images under the size cap', () => {
    const c = newCase('x');
    const id = (c.steps[0] as { id: string }).id;
    const ok = addAttachment(c, id, { name: 'a.png', dataUrl: 'data:image/png;base64,AA' });
    expect(ok?.steps[0]?.attachments).toHaveLength(1);
    expect(
      addAttachment(c, id, { name: 'a.txt', dataUrl: 'data:text/plain;base64,AA' }),
    ).toBeNull();
    let full = c;
    for (let i = 0; i < 5; i++)
      full =
        addAttachment(full, id, { name: `${i}.png`, dataUrl: 'data:image/png;base64,AA' }) ?? full;
    expect(
      addAttachment(full, id, { name: 'six.png', dataUrl: 'data:image/png;base64,AA' }),
    ).toBeNull();
  });
  it('counts cases by overall result', () => {
    const a = patchStep(newCase('a'), '', {});
    const b = newCase('b');
    const failed = patchStep(b, (b.steps[0] as { id: string }).id, { status: 'fail' });
    expect(countCases([a, failed])).toEqual({
      total: 2,
      pass: 0,
      fail: 1,
      blocked: 0,
      untested: 1,
    });
  });
});

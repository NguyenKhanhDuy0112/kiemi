import { describe, expect, it } from 'vitest';
import { classifyFailure } from './quick-fixes';

describe('classifyFailure [FX-06]', () => {
  const kind = (code: string, message = '') => classifyFailure({ code, message } as never);
  it('maps each error type to its group of quick fixes', () => {
    expect(kind('ELEMENT_NOT_FOUND')).toBe('notFound');
    expect(kind('ELEMENT_AMBIGUOUS')).toBe('notFound');
    expect(kind('STEP_TIMEOUT')).toBe('timeout');
    expect(kind('ASSERTION_FAILED')).toBe('assertion');
    expect(kind('HTTP_ERROR')).toBe('network');
    expect(kind('API_ERROR')).toBe('network');
  });
  it('recognises a click taken by something in front of the element', () => {
    expect(kind('STEP_FAILED', '<div id="b"> intercepts pointer events')).toBe('blocked');
    expect(kind('STEP_FAILED', 'something else')).toBe('other');
  });
});

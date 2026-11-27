import { describe, expect, it } from 'vitest';
import { formatPercent, rateTone } from './format';

describe('dashboard format', () => {
  it('formats and colours pass rates', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(0.666)).toBe('67%');
    expect(rateTone(0.95).text).toContain('green');
    expect(rateTone(0.75).text).toContain('amber');
    expect(rateTone(0.1).text).toContain('red');
  });
});

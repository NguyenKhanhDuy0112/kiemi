import { describe, expect, it } from 'vitest';
import { labelsOf, labelsOfCase, qualityTag, techniqueTag, withLabels } from './design-labels';

describe('design labels [CV-01]', () => {
  it('reads, replaces and removes labels without touching other tags', () => {
    const tags = ['smoke', techniqueTag('boundary'), qualityTag('functional')];
    expect(labelsOf(tags)).toEqual({ technique: 'boundary', quality: 'functional' });
    expect(withLabels(tags, { technique: 'pairwise' })).toEqual([
      'smoke',
      'technique:pairwise',
      'quality:functional',
    ]);
    expect(withLabels(tags, { quality: null })).toEqual(['smoke', 'technique:boundary']);
    expect(labelsOf(['technique:nonsense', 'quality:x'])).toEqual({});
    expect(withLabels([], {})).toEqual([]);
  });

  it('labels generated cases, attacks as security', () => {
    expect(labelsOfCase('boundary', 'name:maxLength.above')).toEqual({
      technique: 'boundary',
      quality: 'functional',
    });
    expect(labelsOfCase('badData', 'name:bad.script-tag')).toEqual({
      technique: 'error-guessing',
      quality: 'security',
    });
    expect(labelsOfCase('valid', 'valid').technique).toBe('use-case');
  });
});

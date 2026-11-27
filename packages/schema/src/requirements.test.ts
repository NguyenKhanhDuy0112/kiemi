import { describe, expect, it } from 'vitest';
import { parseRequirements, requirementCoverage } from './requirements';

const reqs = parseRequirements(
  'HR-1 | Tạo đơn nghỉ\nHR-2 | Duyệt đơn\nHR-3 | Báo cáo\n\nHR-1 | trùng',
);
const t = (id: string, tags: string[], lastStatus: string | null) => ({
  id,
  name: id,
  tags,
  lastStatus,
});

describe('requirement coverage [T-04, CV-05]', () => {
  it('parses lines and skips repeats', () => {
    expect(reqs.map((r) => r.key)).toEqual(['HR-1', 'HR-2', 'HR-3']);
    expect(reqs[0]?.title).toBe('Tạo đơn nghỉ');
  });

  it('classifies each requirement and reports unknown keys', () => {
    const c = requirementCoverage(reqs, [
      t('a', ['req:hr-1'], 'passed'),
      t('b', ['req:HR-1', 'smoke'], 'passed'),
      t('c', ['req:HR-2'], 'failed'),
      t('d', ['req:HR-9'], 'passed'),
    ]);
    expect(c.rows.map((r) => r.state)).toEqual(['passing', 'failing', 'none']);
    expect(c.unknownKeys).toEqual(['HR-9']);
    expect(c.coveredPercent).toBe(67);
    expect(c.passingPercent).toBe(33);
  });

  it('a never-run test makes it untested; no requirements → null rates', () => {
    expect(requirementCoverage(reqs, [t('a', ['req:HR-1'], null)]).rows[0]?.state).toBe('untested');
    expect(requirementCoverage([], []).coveredPercent).toBeNull();
  });
});

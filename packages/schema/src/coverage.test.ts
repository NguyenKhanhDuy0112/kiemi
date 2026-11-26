import { describe, expect, it } from 'vitest';
import { type CoverageTest, computeCoverage, pathOf } from './coverage';
import { formCaseTag } from './form-matrix';
import { FormSpecSchema } from './form-spec';

const t = (
  id: string,
  urls: string[],
  tags: string[] = [],
  product: string | null = null,
): CoverageTest => ({
  id,
  name: id,
  tags,
  urls,
  product,
});

describe('coverage [CV-01, CV-02, CV-04]', () => {
  it('normalises addresses', () => {
    expect(pathOf('{{app}}/dang-ky/?x=1#top')).toBe('/dang-ky');
    expect(pathOf('https://site.vn/a/b')).toBe('/a/b');
    expect(pathOf('{{app.admin}}')).toBe('/');
    expect(pathOf('list.html')).toBe('/list.html');
  });

  it('lists pages without tests and the missing checklist groups', () => {
    const form = FormSpecSchema.parse({
      id: 'reg',
      name: 'Đăng ký',
      fields: [{ key: 'a', label: 'A', readBack: { strategies: [{ kind: 'css', value: '#a' }] } }],
    });
    const cov = computeCoverage(
      [
        { id: 'p1', name: 'Đăng ký', path: '/dang-ky', kind: 'form' },
        { id: 'p2', name: 'Danh sách', path: '/ds', kind: 'list' },
        { id: 'p3', name: 'Báo cáo', path: '/bao-cao', kind: 'dashboard' },
      ],
      [
        t('a', ['{{app}}/dang-ky'], [formCaseTag('reg', 'valid'), 'technique:use-case']),
        t(
          'b',
          ['{{app}}/dang-ky'],
          [formCaseTag('reg', 'a:unique'), 'technique:equivalence', 'quality:functional'],
        ),
        t('c', ['{{app}}/ds'], ['covers:sort', 'covers:filter']),
        t('d', ['{{app}}/dang-ky'], [], 'admin'),
      ],
      [form],
      'web',
    );
    expect(cov.untested.map((p) => p.name)).toEqual(['Báo cáo']);
    const reg = cov.pages[0];
    expect(reg?.tests.map((x) => x.id)).toEqual(['a', 'b']);
    expect(reg?.groups).toEqual([
      { group: 'validate', covered: true },
      { group: 'duplicate', covered: true },
      { group: 'roundtrip', covered: true },
      { group: 'permission', covered: false },
    ]);
    const list = cov.pages[1];
    expect(list?.groups.filter((g) => !g.covered).map((g) => g.group)).toEqual([
      'search',
      'pagination',
      'permission',
    ]);
    expect(cov.byTechnique.find((x) => x.key === 'use-case')?.count).toBe(1);
    expect(cov.byQuality.find((x) => x.key === 'functional')?.count).toBe(1);
    expect(cov.unlabelled).toBe(2);
  });
});

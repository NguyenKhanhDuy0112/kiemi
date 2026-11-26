// @vitest-environment node
import { createMemoryServices } from '@kiemi/db';
import { generateFormCases } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { generateFormTests } from './generate-tests';

describe('generateFormTests [R-03]', () => {
  it('creates a folder with one test per ticked case and skips existing ones when run again', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    s.projects.setFormSpecs(projectId, [
      {
        id: 'reg',
        name: 'Đăng ký',
        path: '/dang-ky',
        fields: [
          { key: 'email', label: 'Email', type: 'email', required: true },
          { key: 'name', label: 'Họ tên', minLength: 2, maxLength: 10 },
        ],
      },
    ]);
    s.projects.setMessageCatalog(projectId, { required: 'Vui lòng nhập {field}' });
    const form = s.projects.formSpecs(projectId)[0];
    const ticked = generateFormCases(form as never)
      .filter((c) => c.selected)
      .map((c) => c.id);
    const first = generateFormTests(s, { projectId, formId: 'reg', caseIds: ticked });
    expect(first.created).toBe(ticked.length);
    const tests = s.testCases.list(projectId, first.folderId);
    expect(tests).toHaveLength(ticked.length);
    const required = tests.find((t) => t.name.endsWith('Email: bỏ trống'));
    const doc = s.testCases.get(required?.id ?? '').content;
    expect(doc.tags).toContain('negative');
    expect(doc.description).toContain('Vui lòng nhập Email');
    expect(doc.steps[0]?.action).toBe('goto');

    const again = generateFormTests(s, { projectId, formId: 'reg', caseIds: ticked });
    expect(again).toMatchObject({ created: 0, skipped: ticked.length, folderId: first.folderId });
    expect(() => generateFormTests(s, { projectId, formId: 'nope', caseIds: ['valid'] })).toThrow();
  });
});

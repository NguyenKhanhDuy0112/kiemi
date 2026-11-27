import { describe, expect, it } from 'vitest';
import { cloneProject, createProjectFromTemplate, PROJECT_TEMPLATES } from './templates';
import { createMemoryServices } from './testing';

describe('project templates [R-15, O-12]', () => {
  it('every template builds a project with folders, tests, suite and valid forms', () => {
    for (const tpl of PROJECT_TEMPLATES) {
      const { services } = createMemoryServices();
      const { projectId, testCount } = createProjectFromTemplate(services, tpl.key, `P ${tpl.key}`);
      expect(testCount).toBeGreaterThan(5);
      expect(services.testCases.list(projectId)).toHaveLength(testCount);
      expect(services.folders.list(projectId)).toHaveLength(tpl.groups.length);
      const [suite] = services.suites.list(projectId);
      expect(suite && services.suites.get(suite.id).items).toHaveLength(testCount);
      expect(services.projects.formSpecs(projectId).length).toBe(tpl.forms.length);
    }
  });

  it('clones a project with its tests and settings', () => {
    const { services } = createMemoryServices();
    const { projectId } = createProjectFromTemplate(services, 'hrm', 'HRM');
    const copy = cloneProject(services, projectId, 'HRM bản sao');
    expect(services.projects.get(copy).name).toBe('HRM bản sao');
    expect(services.testCases.list(copy)).toHaveLength(services.testCases.list(projectId).length);
    expect(services.projects.formSpecs(copy)).toHaveLength(1);
    expect(services.projects.formSpecs(copy)[0]?.productId ?? null).toBeNull();
    expect(services.suites.list(copy)).toHaveLength(1);
  });
});

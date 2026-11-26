// @vitest-environment node
import { createMemoryServices } from '@kiemi/db';
import { describe, expect, it } from 'vitest';
import { createTestRunManager } from '../../run/testing';
import { createCaller } from '../root';
import { gotoUrls } from './coverage';

describe('coverage router [CV-02]', () => {
  it('finds goto addresses, also inside groups', () => {
    expect(
      gotoUrls([
        { action: 'goto', params: { url: '{{app}}/a' } },
        { action: 'if', params: {}, steps: [{ action: 'goto', params: { url: '{{app}}/b' } }] },
        { action: 'click', params: { target: {} } },
      ]),
    ).toEqual(['{{app}}/a', '{{app}}/b']);
  });

  it('lists the pages that have no test', async () => {
    const { services, defaultProjectId: projectId } = createMemoryServices();
    const caller = createCaller({
      appVersion: '1',
      platform: 'darwin',
      services,
      defaultProjectId: projectId,
      runs: createTestRunManager(services),
    });
    const t = services.testCases.create({ projectId, name: 'Mở đăng ký' });
    services.testCases.save(t.id, {
      ...t.content,
      steps: [{ id: 's1', action: 'goto', params: { url: '{{app}}/dang-ky' } }],
    });
    services.projects.setPages(projectId, [
      { id: 'a', name: 'Đăng ký', path: '/dang-ky', kind: 'form' },
      { id: 'b', name: 'Giỏ hàng', path: '/gio-hang', kind: 'list' },
    ]);
    const cov = await caller.coverage.get({ projectId });
    expect(cov.untested.map((p) => p.name)).toEqual(['Giỏ hàng']);
    expect(cov.pages[0]?.tests.map((x) => x.name)).toEqual(['Mở đăng ký']);
  });
});

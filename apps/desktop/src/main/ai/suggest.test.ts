import { createMemoryServices } from '@kiemi/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gapsText, suggestCases } from './suggest';

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const { services, defaultProjectId: p } = createMemoryServices();
  services.aiSettings.save(
    p,
    {
      enabled: true,
      kind: 'claude',
      model: 'm',
      taskModels: {},
      baseUrl: '',
      localOnly: false,
      limitTokens: null,
      priceIn: null,
      priceOut: null,
    },
    'k',
  );
  services.projects.setPages(p, [
    { id: 'pg1', name: 'Danh sách', path: '/danh-sach', kind: 'list' },
  ]);
  services.projects.setRequirements(p, [{ key: 'REQ-1', title: 'Tìm kiếm' }]);
  services.testCases.create({ projectId: p, name: 'Đăng nhập' });
  return { services, p };
}

describe('suggest missing cases [AI-19, AI-08]', () => {
  it('lists uncovered checklist groups, requirements without tests and existing tests', () => {
    const { services, p } = setup();
    const t = gapsText(services, p);
    expect(t).toContain('/danh-sach');
    expect(t).toContain('REQ-1');
    expect(t).toContain('Đăng nhập');
  });

  it('asks for a cases proposal with the gaps in the message and returns it unsaved', async () => {
    const { services, p } = setup();
    const bodies: string[] = [];
    const cases = [
      { id: 'c1', group: 'Tìm kiếm', name: 'Tìm không có kết quả', expected: 'Báo trống' },
    ];
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                reply: 'Thiếu nhóm tìm kiếm',
                proposal: { kind: 'cases', cases },
              }),
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    });
    const r = await suggestCases(services, p, 'missing');
    expect(r.proposal).toEqual({ kind: 'cases', cases });
    expect(bodies[0]).toContain('REQ-1');
    expect(services.testCases.list(p)).toHaveLength(1);
  });
});

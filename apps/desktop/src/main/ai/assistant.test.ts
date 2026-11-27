import { createMemoryServices } from '@kiemi/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat } from './assistant';

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
  return { services, p };
}

/** Model replies in order; keeps what was sent. */
function model(...replies: string[]) {
  const sent: { system?: string; messages: { content: string }[] }[] = [];
  let i = 0;
  vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    const text = replies[Math.min(i++, replies.length - 1)] ?? '';
    return new Response(
      JSON.stringify({
        content: [{ type: 'text', text }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
  });
  return sent;
}

afterEach(() => vi.unstubAllGlobals());

const goto = { id: 's1', action: 'goto', params: { url: 'https://x.vn' } };

describe('assistant chat [AI-13, AI-18]', () => {
  it('returns a reply and a checked test proposal; saves nothing', async () => {
    const { services, p } = setup();
    model(
      JSON.stringify({
        reply: 'Đây là test',
        proposal: { kind: 'test', name: 'Mở trang', steps: [goto] },
      }),
    );
    const r = await chat(services, p, [], 'tạo test mở trang');
    expect(r.proposal).toMatchObject({ kind: 'test', name: 'Mở trang' });
    expect(services.testCases.list(p)).toHaveLength(0);
    expect(services.aiSettings.audit(p)[0]).toMatchObject({ action: 'propose', allowed: true });
  });

  it('runs a lookup tool, then answers with its result', async () => {
    const { services, p } = setup();
    services.testCases.create({ projectId: p, name: 'Tạo đơn' });
    const sent = model(
      JSON.stringify({ tool: 'listTests', args: {} }),
      JSON.stringify({ reply: 'Có test Tạo đơn', proposal: null }),
    );
    const r = await chat(services, p, [], 'có test nào?');
    expect(r.toolsUsed).toEqual(['listTests']);
    expect(r.reply).toContain('Tạo đơn');
    expect(sent[1]?.messages.at(-1)?.content).toContain('TOOL RESULT listTests');
  });

  it('sends the model its own mistake once: an action outside the catalog', async () => {
    const { services, p } = setup();
    const sent = model(
      JSON.stringify({
        reply: 'a',
        proposal: { kind: 'test', name: 't', steps: [{ id: 'x', action: 'teleport', params: {} }] },
      }),
      JSON.stringify({ reply: 'đã sửa', proposal: { kind: 'test', name: 't', steps: [goto] } }),
    );
    const r = await chat(services, p, [], 'tạo');
    expect(sent[1]?.messages.at(-1)?.content).toContain('Unknown action "teleport"');
    expect(r.reply).toBe('đã sửa');
    expect(r.proposal?.kind).toBe('test');
  });

  it('drops a proposal that stays invalid and reports the problems', async () => {
    const { services, p } = setup();
    model(
      JSON.stringify({
        reply: 'a',
        proposal: { kind: 'test', name: 't', steps: [{ id: 'x', action: 'teleport', params: {} }] },
      }),
    );
    const r = await chat(services, p, [], 'tạo');
    expect(r.proposal).toBeNull();
    expect(r.problems[0]).toMatch(/teleport/);
  });

  it('keeps plain text answers and puts notes + page context in the system prompt', async () => {
    const { services, p } = setup();
    services.projects.setNotes(p, '- Dùng tài khoản qa1\n');
    const sent = model('Xin chào!');
    const r = await chat(services, p, [], 'hi', { context: 'Page: Đăng ký' });
    expect(r.reply).toBe('Xin chào!');
    expect(sent[0]?.system).toContain('Dùng tài khoản qa1');
    expect(sent[0]?.system).toContain('Page: Đăng ký');
    expect(sent[0]?.system).toContain('Action catalog');
  });

  it('edits a case table by words: the full list comes back', async () => {
    const { services, p } = setup();
    const cases = [{ id: 'c1', group: 'Email', name: 'Email trống', expected: 'Báo bắt buộc' }];
    model(JSON.stringify({ reply: 'Đã bỏ nhóm X', proposal: { kind: 'cases', cases } }));
    const r = await chat(services, p, [{ role: 'assistant', content: 'bảng cũ' }], 'Bỏ nhóm X');
    expect(r.proposal).toEqual({ kind: 'cases', cases });
  });
});

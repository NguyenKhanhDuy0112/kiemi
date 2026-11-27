import { createMemoryServices } from '@kiemi/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  casesFromDocument,
  describeToSteps,
  documentText,
  summarizeRun,
  writeBugReport,
} from './write';

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
  return { services, p };
}

function model(text: string) {
  const bodies: { system?: string; messages: { content: string }[] }[] = [];
  vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(
      JSON.stringify({
        content: [{ type: 'text', text }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
  });
  return bodies;
}

describe('writing features [AI-05, AI-06, AI-11]', () => {
  it('sentences → a test proposal, asking for PICK notes where unsure', async () => {
    const { services, p } = setup();
    const step = { id: 's1', action: 'goto', params: { url: 'https://x.vn' } };
    const bodies = model(
      JSON.stringify({ reply: 'ok', proposal: { kind: 'test', name: 'T', steps: [step] } }),
    );
    const r = await describeToSteps(services, p, 'Mở trang\nBấm Lưu', 'Page: Demo');
    expect(r.proposal?.kind).toBe('test');
    expect(bodies[0]?.messages[0]?.content).toContain('PICK:');
    expect(bodies[0]?.system).toContain('Page: Demo');
  });

  it('reads text, csv and xlsx documents; refuses Word', async () => {
    expect(await documentText('a.txt', new TextEncoder().encode('Case 1: đăng nhập'))).toContain(
      'đăng nhập',
    );
    const { writeExcel } = await import('@kiemi/db');
    const xlsx = await writeExcel({
      columns: ['ID', 'Case'],
      rows: [{ ID: 'TC1', Case: 'Đăng nhập đúng' }],
    });
    expect(await documentText('cases.xlsx', xlsx)).toContain('TC1 | Đăng nhập đúng');
    await expect(documentText('a.docx', new Uint8Array())).rejects.toThrow(/Unsupported/);
  });

  it('document → cases proposal with the text in the message; secrets stay hidden', async () => {
    const { services, p } = setup();
    const cases = [
      { id: 'TC1', group: 'Login', name: 'Đăng nhập đúng', expected: 'Vào trang chủ' },
    ];
    const bodies = model(JSON.stringify({ reply: 'ok', proposal: { kind: 'cases', cases } }));
    const r = await casesFromDocument(services, p, 'srs.txt', 'TC1 liên hệ boss@corp.vn');
    expect(r.proposal).toEqual({ kind: 'cases', cases });
    expect(JSON.stringify(bodies[0])).not.toContain('boss@corp.vn');
  });

  it('bug report and run summary use the failure data', async () => {
    const { services, p } = setup();
    const t = services.testCases.create({ projectId: p, name: 'Lưu đơn' });
    const bodies = model('# Lỗi lưu đơn');
    const md = await writeBugReport(services, p, {
      testCaseId: t.id,
      stepId: 's1',
      error: { code: 'ELEMENT_NOT_FOUND', message: 'Không thấy nút Lưu' },
      environmentName: 'UAT',
    });
    expect(md).toBe('# Lỗi lưu đơn');
    expect(bodies[0]?.messages[0]?.content).toContain('UAT');

    const run = services.runs.create({ projectId: p } as never);
    const rc = services.runs.addCase({ runId: run.id, testCaseId: t.id });
    services.runs.abortCase(rc.id, 'error', { code: 'X', message: 'Hỏng mạng' });
    model('Tóm tắt: 1 lỗi');
    expect(await summarizeRun(services, p, run.id)).toContain('Tóm tắt');
  });
});

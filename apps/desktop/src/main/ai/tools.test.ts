import { createMemoryServices } from '@kiemi/db';
import { describe, expect, it } from 'vitest';
import { proposeNote, runTool, saveNotes, toolsText } from './tools';

function setup() {
  const { services, defaultProjectId: p } = createMemoryServices();
  const t = services.testCases.create({ projectId: p, name: 'Tạo đơn' });
  services.testCases.save(t.id, {
    ...t.content,
    steps: [
      {
        id: 's1',
        action: 'click',
        params: { target: { strategies: [{ type: 'text', value: 'Lưu' }] } },
      },
    ],
  });
  services.testCases.create({ projectId: p, name: 'Đăng nhập' });
  return { services, p, testId: t.id };
}

describe('AI lookup tools [AI-16]', () => {
  it('answers "which test uses the Save button?"', () => {
    const { services, p, testId } = setup();
    const r = JSON.parse(runTool(services, p, 'listTests', { query: 'Lưu' })) as { id: string }[];
    expect(r.map((x) => x.id)).toEqual([testId]);
    expect(JSON.parse(runTool(services, p, 'getTest', { id: testId })).name).toBe('Tạo đơn');
  });

  it('never returns secret values, rejects unknown tools and bad arguments', () => {
    const { services, p } = setup();
    const env = services.environments.create({ projectId: p, name: 'UAT', type: 'uat' } as never);
    services.environments.setSecret(env.id, 'pw', 'Sup3rS3cret!');
    expect(runTool(services, p, 'getEnv', {})).not.toContain('Sup3rS3cret!');
    expect(() => runTool(services, p, 'dropEverything', {})).toThrow(/Unknown tool/);
    expect(() => runTool(services, p, 'getTest', {})).toThrow();
    expect(toolsText()).toContain('getRunHistory');
  });

  it('refuses a test of another project', () => {
    const { services, testId } = setup();
    expect(() => runTool(services, 'other-project', 'getTest', { id: testId })).toThrow();
  });
});

describe('project notes [AI-20]', () => {
  it('proposes without saving; saves only when approved, and logs the refusal', () => {
    const { services, p } = setup();
    const next = proposeNote(services, p, 'Dùng tài khoản qa1 cho UAT');
    expect(services.projects.notes(p)).toBe('');
    expect(() => saveNotes(services, p, next, false)).toThrow();
    expect(services.projects.notes(p)).toBe('');
    saveNotes(services, p, next, true);
    expect(runTool(services, p, 'getProjectNotes', {})).toContain('qa1');
    expect(proposeNote(services, p, 'x')).toContain('- Dùng tài khoản qa1 cho UAT\n- x');
  });
});

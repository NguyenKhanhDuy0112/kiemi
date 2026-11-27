import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createGateway } from './gateway';
import { guardAction } from './guard';
import { redact } from './redact';
import { applyAccepted, diffParts, parseProposal } from './review';
import { AiError, type AiProvider, type AiRequest } from './types';

function spy(text = 'ok'): { provider: AiProvider; sent: AiRequest[] } {
  const sent: AiRequest[] = [];
  return {
    sent,
    provider: {
      kind: 'claude',
      complete: async (r) => {
        sent.push(r);
        return { text, model: 'm', usage: { inputTokens: 10, outputTokens: 5 } };
      },
    },
  };
}
const ask = (content: string): AiRequest => ({ messages: [{ role: 'user', content }] });

describe('redact [AI-02]', () => {
  it('hides secrets, emails, phones and ID numbers, and counts them', () => {
    const r = redact(
      'login an@x.vn pass Sup3rS3cret! tel 0912 345 678 / +84912345678 cccd 012345678901 price 150000',
      { secrets: ['Sup3rS3cret!'] },
    );
    expect(r.text).not.toMatch(/Sup3r|an@x|0912|012345678901/);
    expect(r.text).toContain('price 150000');
    expect(r.counts).toEqual({ secret: 1, email: 1, phone: 2, idNumber: 1 });
  });
  it('can leave PII but still hides secrets; ignores tiny secrets', () => {
    const r = redact('a@b.co abc', { pii: false, secrets: ['abc', 'longsecret'] });
    expect(r.text).toBe('a@b.co abc');
  });
});

describe('gateway', () => {
  it('sends only the redacted text and exposes it in preview', async () => {
    const { provider, sent } = spy();
    const g = createGateway({
      provider,
      config: { kind: 'claude', model: 'm' },
      redact: { secrets: ['hunter22'] },
    });
    const p = g.preview({ ...ask('pw hunter22 mail a@b.vn'), system: 'ctx hunter22' });
    expect(p.redactions).toMatchObject({ secret: 2, email: 1 });
    await g.ask(ask('pw hunter22 mail a@b.vn'));
    expect(JSON.stringify(sent)).not.toMatch(/hunter22|a@b\.vn/);
  });

  it('refuses a remote model when the project is local-only', async () => {
    const { provider, sent } = spy();
    const g = createGateway({ provider, config: { kind: 'claude', model: 'm' }, localOnly: true });
    await expect(g.ask(ask('x'))).rejects.toMatchObject({ code: 'AI_LOCAL_ONLY' });
    expect(sent).toHaveLength(0);
    const local = createGateway({
      provider,
      config: { kind: 'ollama', model: 'm' },
      localOnly: true,
    });
    await expect(local.ask(ask('x'))).resolves.toMatchObject({ text: 'ok' });
  });

  it('caches identical requests, counts usage and stops at the limit', async () => {
    const { provider, sent } = spy();
    const used: number[] = [];
    const g = createGateway({
      provider,
      config: { kind: 'claude', model: 'm' },
      limit: { tokens: 30 },
      prices: { inPerMillion: 1_000_000, outPerMillion: 2_000_000 },
      now: () => new Date(2026, 10, 27),
      onUsage: (u) => used.push(u.inputTokens),
    });
    const a = await g.ask(ask('one'));
    expect(a).toMatchObject({ cached: false, cost: 20 });
    expect(await g.ask(ask('one'))).toMatchObject({ cached: true, cost: 0 });
    expect(sent).toHaveLength(1);
    await g.ask(ask('two')); // 15 + 15 = 30 tokens
    await expect(g.ask(ask('three'))).rejects.toMatchObject({ code: 'AI_BUDGET' });
    expect(used).toEqual([10, 10]);
    expect(await g.ask(ask('one'))).toMatchObject({ cached: true }); // cache needs no budget
  });
});

describe('review [AI-03]', () => {
  const schema = z.array(z.object({ id: z.string(), name: z.string() }));
  it('reads fenced or plain JSON and rejects what breaks the schema', () => {
    expect(parseProposal('Here:\n```json\n[{"id":"1","name":"a"}]\n```', schema)).toEqual({
      ok: true,
      value: [{ id: '1', name: 'a' }],
    });
    expect(parseProposal('Sure [{"id":"1","name":"a"}]', schema).ok).toBe(true);
    const bad = parseProposal('[{"id":1}]', schema);
    expect(bad.ok).toBe(false);
    expect(parseProposal('no json', schema).ok).toBe(false);
  });

  it('applies only accepted parts', () => {
    const before = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'c', n: 3 },
    ];
    const after = [
      { id: 'a', n: 1 },
      { id: 'b', n: 20 },
      { id: 'd', n: 4 },
    ];
    const parts = diffParts(before, after, (x) => x.id);
    expect(parts.map((p) => `${p.id}:${p.status}`)).toEqual([
      'a:same',
      'b:changed',
      'd:added',
      'c:removed',
    ]);
    expect(applyAccepted(parts, new Set())).toEqual(before);
    expect(applyAccepted(parts, new Set(['b', 'd', 'c']))).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 20 },
      { id: 'd', n: 4 },
    ]);
  });
});

describe('guardAction [AI-21]', () => {
  it('blocks save/delete without approval, bulk runs always, protected writes always, and logs', () => {
    const log: string[] = [];
    const audit = (e: { action: string; allowed: boolean }) => log.push(`${e.action}:${e.allowed}`);
    expect(() => guardAction({ kind: 'save' }, { approved: false }, audit)).toThrow(AiError);
    expect(() => guardAction({ kind: 'save' }, { approved: true }, audit)).not.toThrow();
    expect(() => guardAction({ kind: 'delete' }, { approved: false }, audit)).toThrow(
      /not approved/,
    );
    expect(() => guardAction({ kind: 'runBulk' }, { approved: true }, audit)).toThrow(/many tests/);
    expect(() =>
      guardAction(
        { kind: 'runStep', writes: true, environmentProtected: true },
        { approved: true },
        audit,
      ),
    ).toThrow(/protected/);
    expect(() =>
      guardAction(
        { kind: 'runStep', writes: false, environmentProtected: true },
        { approved: true },
        audit,
      ),
    ).not.toThrow();
    expect(() => guardAction({ kind: 'read' }, { approved: false }, audit)).not.toThrow();
    expect(log).toEqual([
      'save:false',
      'save:true',
      'delete:false',
      'runBulk:false',
      'runStep:false',
      'runStep:true',
      'read:true',
    ]);
  });
});

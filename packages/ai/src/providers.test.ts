import { describe, expect, it } from 'vitest';
import { createProvider, isLocal, modelFor } from './providers';
import type { AiError, FetchLike } from './types';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fake(reply: unknown, status = 200): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)),
      });
      return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply), { status });
    },
  };
}

const ask = { messages: [{ role: 'user' as const, content: 'hi' }], system: 'be brief' };

describe('providers', () => {
  it('Claude: x-api-key, system at top level, joins text parts, reads usage', async () => {
    const f = fake({
      model: 'claude-x',
      content: [
        { type: 'text', text: 'he' },
        { type: 'text', text: 'llo' },
      ],
      usage: { input_tokens: 7, output_tokens: 3 },
    });
    const p = createProvider({ kind: 'claude', model: 'm' }, { apiKey: 'k1', fetch: f.fetch });
    const r = await p.complete(ask);
    expect(r).toEqual({
      text: 'hello',
      model: 'claude-x',
      usage: { inputTokens: 7, outputTokens: 3 },
    });
    expect(f.calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(f.calls[0]?.headers['x-api-key']).toBe('k1');
    expect(f.calls[0]?.body.system).toBe('be brief');
  });

  it('OpenAI-compatible: bearer, system as first message, custom base URL', async () => {
    const f = fake({
      choices: [{ message: { content: 'yo' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });
    const p = createProvider(
      { kind: 'openai', model: 'gpt', baseUrl: 'https://llm.example.com/v1/' },
      { apiKey: 'k2', fetch: f.fetch },
    );
    const r = await p.complete(ask);
    expect(r.text).toBe('yo');
    expect(r.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
    expect(f.calls[0]?.url).toBe('https://llm.example.com/v1/chat/completions');
    expect(f.calls[0]?.headers.authorization).toBe('Bearer k2');
    expect(((f.calls[0]?.body.messages ?? []) as unknown[])[0]).toEqual({
      role: 'system',
      content: 'be brief',
    });
  });

  it('Ollama: no key, not streamed, token counts', async () => {
    const f = fake({ message: { content: 'ok' }, prompt_eval_count: 9, eval_count: 4 });
    const p = createProvider({ kind: 'ollama', model: 'llama3' }, { fetch: f.fetch });
    const r = await p.complete(ask);
    expect(r.usage).toEqual({ inputTokens: 9, outputTokens: 4 });
    expect(f.calls[0]?.url).toBe('http://localhost:11434/api/chat');
    expect(f.calls[0]?.body.stream).toBe(false);
  });

  it('uses the model of the task', async () => {
    const f = fake({ choices: [{ message: { content: 'x' } }] });
    const cfg = { kind: 'openai' as const, model: 'big', taskModels: { classify: 'small' } };
    await createProvider(cfg, { apiKey: 'k', fetch: f.fetch }).complete({
      ...ask,
      task: 'classify',
    });
    expect(f.calls[0]?.body.model).toBe('small');
    expect(modelFor(cfg, 'chat')).toBe('big');
  });

  it('maps failures to codes and never leaks the key', async () => {
    const key = 'sk-secret-123';
    const run = (status: number, body: string) =>
      createProvider(
        { kind: 'claude', model: 'm' },
        { apiKey: key, fetch: fake(body, status).fetch },
      )
        .complete(ask)
        .catch((e: unknown) => e as AiError);
    expect(((await run(401, 'bad key sk-secret-123')) as AiError).code).toBe('AI_AUTH');
    expect(((await run(429, '')) as AiError).code).toBe('AI_RATE_LIMIT');
    expect(((await run(500, 'boom')) as AiError).code).toBe('AI_HTTP');
    expect(((await run(200, 'not json')) as AiError).code).toBe('AI_BAD_RESPONSE');
    const net = await createProvider(
      { kind: 'claude', model: 'm' },
      {
        apiKey: key,
        fetch: async () => {
          throw new Error(`down ${key}`);
        },
      },
    )
      .complete(ask)
      .catch((e: unknown) => e as AiError);
    expect((net as AiError).code).toBe('AI_NETWORK');
    expect((net as AiError).message).not.toContain(key);
    expect(((await run(401, `x ${key}`)) as AiError).message).not.toContain(key);
  });

  it('needs a key except for local servers', async () => {
    const f = fake({ choices: [{ message: { content: 'x' } }] });
    await expect(
      createProvider({ kind: 'claude', model: 'm' }, { fetch: f.fetch }).complete(ask),
    ).rejects.toMatchObject({ code: 'AI_AUTH' });
    await expect(
      createProvider(
        { kind: 'openai', model: 'm', baseUrl: 'http://localhost:1234/v1' },
        { fetch: f.fetch },
      ).complete(ask),
    ).resolves.toMatchObject({ text: 'x' });
  });

  it('isLocal: Ollama default and localhost only', () => {
    expect(isLocal({ kind: 'ollama', model: 'm' })).toBe(true);
    expect(isLocal({ kind: 'openai', model: 'm', baseUrl: 'http://127.0.0.1:8080' })).toBe(true);
    expect(isLocal({ kind: 'claude', model: 'm' })).toBe(false);
    expect(isLocal({ kind: 'ollama', model: 'm', baseUrl: 'https://gpu.corp' })).toBe(false);
  });
});

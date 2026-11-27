import { num, postJson } from './http';
import {
  type AiConfig,
  AiError,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  type AiTask,
  type ProviderDeps,
} from './types';

const DEFAULT_MAX_TOKENS = 2048;

/** Model for a task: the per-task one when set, else the default. */
export function modelFor(config: AiConfig, task?: AiTask): string {
  return (task && config.taskModels?.[task]) || config.model;
}

const trimSlash = (s: string) => s.replace(/\/+$/, '');

/** True when nothing leaves this computer (Ollama, or any server on localhost) [AI-02]. */
export function isLocal(config: AiConfig): boolean {
  if (config.kind === 'ollama' && !config.baseUrl) return true;
  if (!config.baseUrl) return false;
  try {
    const h = new URL(config.baseUrl).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

function needKey(deps: ProviderDeps): string {
  if (!deps.apiKey) throw new AiError('AI_AUTH', 'An API key is required');
  return deps.apiKey;
}

function claude(config: AiConfig, deps: ProviderDeps): AiProvider {
  const base = trimSlash(config.baseUrl ?? 'https://api.anthropic.com');
  return {
    kind: 'claude',
    async complete(req: AiRequest): Promise<AiResponse> {
      const model = modelFor(config, req.task);
      const json = await postJson(
        deps.fetch ?? fetch,
        `${base}/v1/messages`,
        { 'x-api-key': needKey(deps), 'anthropic-version': '2023-06-01' },
        {
          model,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(req.system ? { system: req.system } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          messages: req.messages,
        },
        req.signal,
      );
      const parts = Array.isArray(json.content) ? json.content : [];
      const text = parts
        .map((p) => (p && typeof p === 'object' && 'text' in p ? String(p.text) : ''))
        .join('');
      if (!text) throw new AiError('AI_BAD_RESPONSE', 'The answer has no text');
      const u = (json.usage ?? {}) as Record<string, unknown>;
      return {
        text,
        model: typeof json.model === 'string' ? json.model : model,
        usage: { inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens) },
      };
    },
  };
}

function openai(config: AiConfig, deps: ProviderDeps): AiProvider {
  const base = trimSlash(config.baseUrl ?? 'https://api.openai.com/v1');
  return {
    kind: 'openai',
    async complete(req: AiRequest): Promise<AiResponse> {
      const model = modelFor(config, req.task);
      // Servers that speak this format but run locally often need no key.
      const key = deps.apiKey ?? (isLocal(config) ? '' : needKey(deps));
      const json = await postJson(
        deps.fetch ?? fetch,
        `${base}/chat/completions`,
        key ? { authorization: `Bearer ${key}` } : {},
        {
          model,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          messages: [
            ...(req.system ? [{ role: 'system', content: req.system }] : []),
            ...req.messages,
          ],
        },
        req.signal,
      );
      const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
      const text = (choice as { message?: { content?: unknown } } | undefined)?.message?.content;
      if (typeof text !== 'string' || !text)
        throw new AiError('AI_BAD_RESPONSE', 'The answer has no text');
      const u = (json.usage ?? {}) as Record<string, unknown>;
      return {
        text,
        model: typeof json.model === 'string' ? json.model : model,
        usage: { inputTokens: num(u.prompt_tokens), outputTokens: num(u.completion_tokens) },
      };
    },
  };
}

function ollama(config: AiConfig, deps: ProviderDeps): AiProvider {
  const base = trimSlash(config.baseUrl ?? 'http://localhost:11434');
  return {
    kind: 'ollama',
    async complete(req: AiRequest): Promise<AiResponse> {
      const model = modelFor(config, req.task);
      const json = await postJson(
        deps.fetch ?? fetch,
        `${base}/api/chat`,
        {},
        {
          model,
          stream: false,
          options: {
            num_predict: req.maxTokens ?? DEFAULT_MAX_TOKENS,
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          },
          messages: [
            ...(req.system ? [{ role: 'system', content: req.system }] : []),
            ...req.messages,
          ],
        },
        req.signal,
      );
      const text = (json.message as { content?: unknown } | undefined)?.content;
      if (typeof text !== 'string' || !text)
        throw new AiError('AI_BAD_RESPONSE', 'The answer has no text');
      return {
        text,
        model: typeof json.model === 'string' ? json.model : model,
        usage: { inputTokens: num(json.prompt_eval_count), outputTokens: num(json.eval_count) },
      };
    },
  };
}

/** Builds the adapter for a project's config. Features only see `AiProvider`. */
export function createProvider(config: AiConfig, deps: ProviderDeps = {}): AiProvider {
  switch (config.kind) {
    case 'claude':
      return claude(config, deps);
    case 'openai':
      return openai(config, deps);
    case 'ollama':
      return ollama(config, deps);
  }
}

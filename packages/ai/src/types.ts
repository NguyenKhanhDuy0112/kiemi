/** Providers the assistant can talk to [AI-01, ADR 0024]. */
export const AI_PROVIDER_KINDS = ['claude', 'openai', 'ollama'] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

/** What a task needs from a model, so the project can pick a cheaper one for easy tasks. */
export const AI_TASKS = ['chat', 'design', 'classify', 'fix', 'write'] as const;
export type AiTask = (typeof AI_TASKS)[number];

export interface AiConfig {
  kind: AiProviderKind;
  /** Default model. */
  model: string;
  /** Model per task; falls back to `model`. */
  taskModels?: Partial<Record<AiTask, string>>;
  /** Server address; default is the provider's own (Ollama: this computer). */
  baseUrl?: string;
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiRequest {
  task?: AiTask;
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiResponse {
  text: string;
  model: string;
  usage: AiUsage;
}

export interface AiProvider {
  readonly kind: AiProviderKind;
  complete(req: AiRequest): Promise<AiResponse>;
}

export type AiErrorCode =
  | 'AI_AUTH'
  | 'AI_RATE_LIMIT'
  | 'AI_NETWORK'
  | 'AI_HTTP'
  | 'AI_BAD_RESPONSE'
  | 'AI_LOCAL_ONLY'
  | 'AI_BUDGET'
  | 'AI_BLOCKED';

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ProviderDeps {
  /** Not needed for Ollama. */
  apiKey?: string;
  fetch?: FetchLike;
}

import { z } from 'zod';

/** Providers and tasks of the AI assistant [AI-01, ADR 0024]; same lists as `@kiemi/ai`. */
export const AI_PROVIDER_KINDS = ['claude', 'openai', 'ollama'] as const;
export const AI_TASKS = ['chat', 'design', 'classify', 'fix', 'write'] as const;

/** Per-project AI settings. The API key is not here: it is encrypted apart. */
export const AiSettingsInputSchema = z.object({
  enabled: z.boolean().default(false),
  kind: z.enum(AI_PROVIDER_KINDS).default('claude'),
  model: z.string().trim().min(1).max(100),
  taskModels: z.partialRecord(z.enum(AI_TASKS), z.string().trim().max(100)).default({}),
  baseUrl: z.string().trim().max(300).default(''),
  /** Project lock: only a model on this computer may be used [AI-02]. */
  localOnly: z.boolean().default(false),
});
export type AiSettingsInput = z.infer<typeof AiSettingsInputSchema>;

export const DEFAULT_AI_MODELS = {
  claude: 'claude-sonnet-5-5',
  openai: 'gpt-4o-mini',
  ollama: 'llama3.1',
} as const;

import { createProvider, isLocal } from '@kiemi/ai';
import { AI_TASKS, AiSettingsInputSchema } from '@kiemi/schema';
import { z } from 'zod';
import { gatewayFor } from '../../ai/gateway';
import { publicProcedure, router } from '../trpc';

const projectId = z.string().min(1);

/** AI assistant settings and connection test [AI-01]. The key goes in, never comes out. */
export const aiRouter = router({
  get: publicProcedure
    .input(z.object({ projectId }))
    .query(({ ctx, input }) => ctx.services.aiSettings.get(input.projectId)),

  save: publicProcedure
    .input(
      z.object({
        projectId,
        settings: AiSettingsInputSchema,
        /** Omit to keep the stored key, '' to remove it. */
        apiKey: z.string().max(500).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.aiSettings.save(input.projectId, input.settings, input.apiKey),
    ),

  /** What would really be sent for this text: the redacted copy and what was hidden [AI-02]. */
  preview: publicProcedure
    .input(
      z.object({
        projectId,
        task: z.enum(AI_TASKS).optional(),
        system: z.string().max(100_000).optional(),
        text: z.string().max(200_000),
      }),
    )
    .query(({ ctx, input }) => {
      const out = gatewayFor(ctx.services, input.projectId).preview({
        ...(input.task ? { task: input.task } : {}),
        ...(input.system ? { system: input.system } : {}),
        messages: [{ role: 'user', content: input.text }],
      });
      return {
        system: out.request.system ?? '',
        text: out.request.messages.map((m) => m.content).join('\n'),
        redactions: out.redactions,
        estimatedTokens: out.estimatedTokens,
      };
    }),

  /** What the assistant did lately, newest first [AI-21]. */
  audit: publicProcedure
    .input(z.object({ projectId }))
    .query(({ ctx, input }) => ctx.services.aiSettings.audit(input.projectId)),

  /** Asks the model for one word, to prove address, key and model work. */
  test: publicProcedure.input(z.object({ projectId })).mutation(async ({ ctx, input }) => {
    const s = ctx.services.aiSettings.forUse(input.projectId, { even: true });
    if (!s) return { ok: false, message: 'not configured' };
    const config = {
      kind: s.kind,
      model: s.model,
      taskModels: s.taskModels,
      ...(s.baseUrl ? { baseUrl: s.baseUrl } : {}),
    };
    if (s.localOnly && !isLocal(config)) {
      const message = 'project allows local models only';
      ctx.services.aiSettings.setResult(input.projectId, false, message);
      return { ok: false, message };
    }
    try {
      const r = await createProvider(config, { apiKey: s.apiKey }).complete({
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        maxTokens: 16,
      });
      ctx.services.aiSettings.setResult(input.projectId, true, r.model);
      return { ok: true, message: r.model };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'failed';
      ctx.services.aiSettings.setResult(input.projectId, false, message);
      return { ok: false, message };
    }
  }),
});

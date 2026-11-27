import { createProvider, isLocal } from '@kiemi/ai';
import { AI_TASKS, AiSettingsInputSchema } from '@kiemi/schema';
import { z } from 'zod';
import { acceptTest, chat } from '../../ai/assistant';
import { applyFix, diagnose } from '../../ai/diagnose';
import { gatewayFor } from '../../ai/gateway';
import { suggestCases } from '../../ai/suggest';
import { proposeNote, runTool, saveNotes } from '../../ai/tools';
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

  /** One chat message; the answer may carry a proposal that the panel shows for approval [AI-13]. */
  chat: publicProcedure
    .input(
      z.object({
        projectId,
        history: z
          .array(
            z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(100_000) }),
          )
          .max(40),
        message: z.string().min(1).max(20_000),
        task: z.enum(AI_TASKS).optional(),
        /** Text of the page open in the browser (from `recorder.pageContext`). */
        context: z.string().max(60_000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      chat(ctx.services, input.projectId, input.history, input.message, {
        ...(input.task ? { task: input.task } : {}),
        ...(input.context ? { context: input.context } : {}),
      }),
    ),

  /** Why a step failed and, when it is stale, a proposed fix (nothing is changed) [AI-09, AI-10, FX-12]. */
  diagnose: publicProcedure
    .input(
      z.object({
        projectId,
        testCaseId: z.string().min(1),
        stepId: z.string().min(1),
        error: z.object({
          code: z.string(),
          message: z.string().max(5000),
          details: z.record(z.string(), z.unknown()).optional(),
        }),
        environmentName: z.string().nullish(),
        pageText: z.string().max(60_000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      diagnose(ctx.services, input.projectId, {
        testCaseId: input.testCaseId,
        stepId: input.stepId,
        error: input.error,
        environmentName: input.environmentName ?? null,
        pageText: input.pageText,
      }),
    ),

  /** The person pressed "apply" on a proposed fix [AI-09, AI-21]. */
  applyFix: publicProcedure
    .input(
      z.object({
        projectId,
        testCaseId: z.string().min(1),
        stepId: z.string().min(1),
        params: z.record(z.string(), z.unknown()),
        alsoSameTarget: z.boolean().default(false),
      }),
    )
    .mutation(({ ctx, input }) => applyFix(ctx.services, input.projectId, input)),

  /** Cases still missing / extra business cases, as a proposal to review [AI-19, AI-08]. */
  suggest: publicProcedure
    .input(
      z.object({
        projectId,
        mode: z.enum(['missing', 'business']),
        context: z.string().max(60_000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      suggestCases(ctx.services, input.projectId, input.mode, input.context),
    ),

  /** The person accepted a test proposal: creates the test (checked again) [AI-03]. */
  acceptTest: publicProcedure
    .input(
      z.object({
        projectId,
        name: z.string().trim().min(1).max(300),
        steps: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
      }),
    )
    .mutation(({ ctx, input }) =>
      acceptTest(ctx.services, input.projectId, input.name, input.steps),
    ),

  /** Notes the assistant reads every session [AI-20]. */
  notes: publicProcedure
    .input(z.object({ projectId }))
    .query(({ ctx, input }) => ctx.services.projects.notes(input.projectId)),

  /** The person typed or accepted these notes: saving is their own approval. */
  saveNotes: publicProcedure
    .input(z.object({ projectId, notes: z.string().max(20000) }))
    .mutation(({ ctx, input }) => {
      saveNotes(ctx.services, input.projectId, input.notes, true);
    }),

  /** "Remember that…": the notes as they would be, nothing saved. */
  proposeNote: publicProcedure
    .input(z.object({ projectId, text: z.string().min(1).max(2000) }))
    .query(({ ctx, input }) => proposeNote(ctx.services, input.projectId, input.text)),

  /** Runs a read-only lookup tool (used by the chat panel) [AI-16]. */
  tool: publicProcedure
    .input(z.object({ projectId, name: z.string().min(1), args: z.unknown().optional() }))
    .query(({ ctx, input }) => runTool(ctx.services, input.projectId, input.name, input.args)),

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

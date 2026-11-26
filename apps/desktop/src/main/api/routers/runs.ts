import { readFileSync } from 'node:fs';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { resolveInside } from '../../results/artifact-path';
import { StartRunInputSchema } from '../../run/start-input';
import { publicProcedure, router } from '../trpc';

const runId = z.object({ runId: z.string().min(1) });

/** Run tests in the engine process, follow them live, read results [M4]. */
export const runsRouter = router({
  start: publicProcedure
    .input(StartRunInputSchema)
    .mutation(({ ctx, input }) => ctx.runs.start(input)),

  cancel: publicProcedure
    .input(runId)
    .mutation(({ ctx, input }) => ({ cancelled: ctx.runs.cancel(input.runId) })),

  /** Tạm dừng / Tiếp tục / Bước tiếp / breakpoints [S-03, H-03]. */
  control: publicProcedure
    .input(
      runId.extend({
        command: z.discriminatedUnion('type', [
          z.object({ type: z.literal('pause') }),
          z.object({ type: z.literal('resume') }),
          z.object({ type: z.literal('step') }),
          z.object({
            type: z.literal('breakpoints'),
            stepIds: z.array(z.string().min(1)).max(500),
          }),
        ]),
      }),
    )
    .mutation(({ ctx, input }) => ({ ok: ctx.runs.control(input.runId, input.command) })),

  /** Stored run with its cases, steps and files [S-04]. */
  get: publicProcedure.input(runId).query(({ ctx, input }) => {
    const run = ctx.services.runs.detail(input.runId);
    const names = new Map<string, string>();
    for (const c of run.cases) {
      if (!names.has(c.testCaseId))
        names.set(c.testCaseId, ctx.services.testCases.repo.find(c.testCaseId, true)?.name ?? '');
    }
    const env = run.environmentId
      ? ctx.services.environments.repo.find(run.environmentId, true)
      : undefined;
    return {
      ...run,
      running: ctx.runs.isRunning(run.id),
      environmentName: env?.name ?? null,
      /** Colour/type/protection for the Run screen and report [O-03]. */
      environment: env
        ? { name: env.name, type: env.type, color: env.color, protected: env.protected }
        : null,
      cases: run.cases.map((c) => ({ ...c, testName: names.get(c.testCaseId) ?? '' })),
    };
  }),

  /** Opens a trace of the run in Playwright's trace viewer [I-03]. */
  openTrace: publicProcedure
    .input(runId.extend({ path: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const run = ctx.services.runs.get(input.runId);
      const file = resolveInside(run.artifactDir ?? '', input.path);
      if (!file) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not a file of this run' });
      await ctx.desktop?.openTrace(file);
      return { ok: true };
    }),

  /** Shows the run's result folder in Finder / Explorer. */
  openFolder: publicProcedure.input(runId).mutation(({ ctx, input }) => {
    const run = ctx.services.runs.get(input.runId);
    if (run.artifactDir) ctx.desktop?.showInFolder(run.artifactDir);
    return { ok: true };
  }),

  /** Screenshots of the run as data URLs, for the self-contained HTML report [I-05]. */
  screenshots: publicProcedure.input(runId).query(({ ctx, input }) => {
    const run = ctx.services.runs.get(input.runId);
    const out: Record<string, string> = {};
    for (const a of ctx.services.runs.listArtifacts(run.id)) {
      if (a.kind !== 'screenshot') continue;
      const file = resolveInside(run.artifactDir ?? '', a.path);
      if (!file) continue;
      try {
        out[a.path] = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
      } catch {
        // missing file: the report shows the step without its picture
      }
    }
    return out;
  }),

  /** Run history, newest first [S-05]. */
  history: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        testCaseId: z.string().min(1).optional(),
        suiteId: z.string().min(1).optional(),
        status: z.enum(['queued', 'running', 'passed', 'failed', 'cancelled', 'error']).optional(),
        limit: z.number().int().min(1).max(1000).default(200),
      }),
    )
    .query(({ ctx, input }) => {
      const { projectId, ...filter } = input;
      const envs = new Map(ctx.services.environments.list(projectId).map((e) => [e.id, e.name]));
      return ctx.services.runs.history(projectId, filter).map((r) => ({
        ...r,
        environmentName: r.environmentId ? (envs.get(r.environmentId) ?? null) : null,
      }));
    }),

  /** Past + live events of one run; ends when the run ends. */
  events: publicProcedure.input(runId).subscription(async function* ({ ctx, input, signal }) {
    yield* ctx.runs.events(input.runId, signal);
  }),
});

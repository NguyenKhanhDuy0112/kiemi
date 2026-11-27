import { z } from 'zod';
import { SessionNameSchema, StepIdSchema } from './step';

export const StepStatusSchema = z.enum(['passed', 'failed', 'skipped']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const RunStatusSchema = z.enum(['passed', 'failed', 'cancelled', 'error']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

const isoDate = z.iso.datetime({ offset: true });

export const RunErrorSchema = z.object({
  /** Stable error code from `@kiemi/shared`, used for i18n messages. */
  code: z.string().min(1),
  /** Already-localised, secret-masked message. */
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type RunError = z.infer<typeof RunErrorSchema>;

export const ArtifactRefSchema = z.object({
  kind: z.enum(['screenshot', 'video', 'trace', 'html', 'log']),
  /** Path relative to the run's artifact directory. */
  path: z.string().min(1),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const DiagnosticSchema = z.object({
  kind: z.enum(['console', 'pageError', 'http']),
  session: SessionNameSchema,
  message: z.string(),
  url: z.string().optional(),
  status: z.number().int().optional(),
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export const StepResultSchema = z.object({
  stepId: StepIdSchema,
  session: SessionNameSchema,
  status: StepStatusSchema,
  /** `soft` failure: recorded but did not stop the run. */
  soft: z.boolean().default(false),
  startedAt: isoDate,
  durationMs: z.number().nonnegative(),
  error: RunErrorSchema.optional(),
  artifacts: z.array(ArtifactRefSchema).default([]),
  /** Results of nested steps (if/else, loops, shared steps) [D-01, D-03, D-04]. */
  get children() {
    return z.array(StepResultSchema).optional();
  },
});
export type StepResult = z.infer<typeof StepResultSchema>;

export const RunResultSchema = z.object({
  runId: z.string().min(1),
  testCaseId: z.string().min(1),
  /** Dataset row index for data-driven runs [E-03]. */
  rowIndex: z.number().int().nonnegative().optional(),
  status: RunStatusSchema,
  startedAt: isoDate,
  durationMs: z.number().nonnegative(),
  steps: z.array(StepResultSchema),
  cleanup: z.array(StepResultSchema).default([]),
  error: RunErrorSchema.optional(),
  /** Run-level files: videos, traces [I-03]. */
  artifacts: z.array(ArtifactRefSchema).default([]),
  /** Console errors and failed requests seen during the run [F-04]. */
  diagnostics: z.array(DiagnosticSchema).default([]),
  /** Values the test noted with `observe`, to compare runs on two environments [V-06]. */
  observations: z.record(z.string(), z.string()).default({}),
});
export type RunResult = z.infer<typeof RunResultSchema>;

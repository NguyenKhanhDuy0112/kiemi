import { z } from 'zod';

export const DEFAULT_SESSION = 'default';

/** Session name: one browser context per session [F-01]. */
export const SessionNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, 'Session name must be letters, digits, `_` or `-`');

export const StepIdSchema = z.string().min(1);

/**
 * One step. `params` is validated by the action plugin registered for `action`
 * (engine `defineAction`), so the schema keeps it open here.
 */
export const StepSchema = z.object({
  id: StepIdSchema,
  action: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
  session: SessionNameSchema.default(DEFAULT_SESSION),
  /** Optional label shown instead of the auto-generated description. */
  name: z.string().optional(),
  note: z.string().optional(),
  /** Disabled steps are skipped [D-06]. */
  enabled: z.boolean().default(true),
  /** `soft` failures are recorded but the test keeps running. */
  mode: z.enum(['hard', 'soft']).default('hard'),
  /** Run this step in the tab with this name (switches first) [V-01]. */
  tab: z.string().min(1).optional(),
  /** Per-step timeout override in milliseconds [D-07]. */
  timeoutMs: z.number().int().positive().optional(),
  /** Skip the step when this condition holds [D-06]; validated by the engine. */
  skipIf: z.record(z.string(), z.unknown()).optional(),
});
export type Step = z.infer<typeof StepSchema>;
export type StepInput = z.input<typeof StepSchema>;

/** Reusable step group with parameters, e.g. "Đăng nhập(user, pass)" [D-01]. */
export const SharedStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Parameter names, available as `{{param.<name>}}` inside the steps. */
  params: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).default([]),
  steps: z.array(StepSchema).min(1),
});
export type SharedStep = z.infer<typeof SharedStepSchema>;
export type SharedStepInput = z.input<typeof SharedStepSchema>;

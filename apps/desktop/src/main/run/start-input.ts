import { z } from 'zod';

/** What to run [H-01]. */
export const RunTargetInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('test'),
    testCaseId: z.string().min(1),
    /** Only this dataset row; otherwise every row runs. */
    rowIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({ kind: z.literal('suite'), suiteId: z.string().min(1) }),
  z.object({ kind: z.literal('tag'), projectId: z.string().min(1), tag: z.string().min(1) }),
]);

/** How to run it [H-02, H-03, H-04, I-02, I-03]. */
export const RunOptionsInputSchema = z.object({
  /** Show the browser window (default: the setting) [G-05]. */
  headless: z.boolean().optional(),
  /** Slow every action down, in ms [H-03]. */
  slowMoMs: z.number().int().min(0).max(5000).optional(),
  /** Run from this top-level step (single test only) [H-03]. */
  startAtStepId: z.string().min(1).optional(),
  /** Pause before these steps [H-03]. */
  breakpoints: z.array(z.string().min(1)).max(500).optional(),
  /** Pause before the first step (step-by-step run) [H-03]. */
  pauseAtStart: z.boolean().optional(),
  /** Keep the browser open on a failed step for fixing; default on for one hand-run test [FX-01]. */
  pauseOnFail: z.boolean().optional(),
  /** Stop the remaining tests after the first one that does not pass [H-04]. */
  stopOnFailure: z.boolean().optional(),
  /** Browser for this run only (matrix run); default = the setting [O-09]. */
  browser: z.enum(['auto', 'msedge', 'chrome', 'chromium']).optional(),
  screenshots: z.enum(['onFailure', 'always', 'off']).optional(),
  video: z.boolean().optional(),
  trace: z.boolean().optional(),
});

export const StartRunInputSchema = z.object({
  target: RunTargetInputSchema,
  /** `undefined` = suite's environment, else the project's first; `null` = none [H-02]. */
  environmentId: z.string().min(1).nullable().optional(),
  options: RunOptionsInputSchema.default({}),
  /** The tester confirmed (twice) running on a protected environment [O-03, W-10]. */
  confirmProtected: z.boolean().optional(),
});

export type StartRunInput = z.input<typeof StartRunInputSchema>;
export type RunOptionsInput = z.infer<typeof RunOptionsInputSchema>;

/** Suite/tag × environments × browsers: one run per combination [O-09]. */
export const StartMatrixInputSchema = z.object({
  target: RunTargetInputSchema,
  environmentIds: z.array(z.string().min(1)).min(1).max(8),
  browsers: z
    .array(z.enum(['msedge', 'chrome', 'chromium']))
    .min(1)
    .max(3),
  options: RunOptionsInputSchema.default({}),
  confirmProtected: z.boolean().optional(),
});
export type StartMatrixInput = z.input<typeof StartMatrixInputSchema>;

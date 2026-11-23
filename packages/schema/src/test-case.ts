import { z } from 'zod';
import { DatasetSourceSchema } from './dataset';
import { ElementRefSchema, ElementSchema } from './locator';
import { ProductKeySchema } from './product';
import { DEFAULT_SESSION, SessionNameSchema, StepSchema } from './step';
import { CURRENT_SCHEMA_VERSION } from './version';

/** A test case — the content of a `.kiemi.json` file [N-08]. */
export const TestCaseSchema = z
  .object({
    /** Optional JSON Schema URL for editor autocompletion. */
    $schema: z.string().optional(),
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    /** UUIDv7. */
    id: z.uuid(),
    name: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string().min(1)).default([]),
    /**
     * Key of the test's main product: `{{app}}` is its URL in the environment of
     * the run. Missing = the project's first product [O-01, O-02] (v2).
     */
    product: ProductKeySchema.optional(),
    /** Environments the test may run on; others skip it with the reason [O-06] (v2). */
    environments: z
      .object({
        only: z.array(z.string().min(1)).optional(),
        except: z.array(z.string().min(1)).optional(),
        reason: z.string().optional(),
      })
      .optional(),
    /** Declared sessions; every step's `session` must be one of these [F-01]. */
    sessions: z.array(SessionNameSchema).min(1).default([DEFAULT_SESSION]),
    /** Reusable elements referenced by `{ "ref": "<key>" }` targets [C-01, C-02]. */
    elements: z.record(ElementRefSchema, ElementSchema).default({}),
    dataset: DatasetSourceSchema.optional(),
    /** Test-level variables (scope: env → suite → test → runtime) [E-02]. */
    variables: z.record(z.string(), z.string()).default({}),
    steps: z.array(StepSchema).default([]),
    /** Always runs, pass or fail [D-05]. */
    cleanup: z.array(StepSchema).default([]),
  })
  .superRefine((tc, ctx) => {
    const sessions = new Set(tc.sessions);
    const ids = new Set<string>();
    const check = (list: 'steps' | 'cleanup') => {
      tc[list].forEach((step, i) => {
        if (ids.has(step.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate step id "${step.id}"`,
            path: [list, i, 'id'],
          });
        }
        ids.add(step.id);
        if (!sessions.has(step.session)) {
          ctx.addIssue({
            code: 'custom',
            message: `Unknown session "${step.session}"`,
            path: [list, i, 'session'],
          });
        }
        for (const ref of collectRefs(step.params)) {
          if (!Object.hasOwn(tc.elements, ref)) {
            ctx.addIssue({
              code: 'custom',
              message: `Unknown element ref "${ref}"`,
              path: [list, i, 'params'],
            });
          }
        }
      });
    };
    check('steps');
    check('cleanup');
  });
export type TestCase = z.infer<typeof TestCaseSchema>;
export type TestCaseInput = z.input<typeof TestCaseSchema>;

/** Finds every `{ ref: "…" }` element reference nested inside step params. */
export function collectRefs(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) collectRefs(v, out);
  } else if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.ref === 'string' && Object.keys(obj).length === 1) out.push(obj.ref);
    for (const v of Object.values(obj)) collectRefs(v, out);
  }
  return out;
}

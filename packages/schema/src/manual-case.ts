import { z } from 'zod';

/** Result of one manual step or a whole manual case [T-03]. */
export const ManualStatusSchema = z.enum(['untested', 'pass', 'fail', 'blocked']);
export type ManualStatus = z.infer<typeof ManualStatusSchema>;

/** Biggest picture kept inside a case (base64 data URL), so project.json stays small. */
export const MAX_ATTACHMENT_CHARS = 1_500_000;
export const MAX_ATTACHMENTS_PER_STEP = 5;

export const ManualAttachmentSchema = z.object({
  name: z.string().min(1).max(200),
  /** `data:image/...;base64,...` */
  dataUrl: z
    .string()
    .startsWith('data:image/')
    .max(MAX_ATTACHMENT_CHARS, 'Picture is too big (max ~1 MB)'),
});
export type ManualAttachment = z.infer<typeof ManualAttachmentSchema>;

export const ManualStepSchema = z.object({
  id: z.string().min(1),
  /** What the tester does. */
  action: z.string().default(''),
  /** What should happen. */
  expected: z.string().default(''),
  status: ManualStatusSchema.default('untested'),
  /** What was really seen (mostly when the step fails). */
  actual: z.string().default(''),
  attachments: z.array(ManualAttachmentSchema).max(MAX_ATTACHMENTS_PER_STEP).default([]),
});
export type ManualStep = z.infer<typeof ManualStepSchema>;

/** A test case written for a person to run by hand [T-03, X-08]. */
export const ManualCaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(300),
  /** Free group (module / screen) — also used by Excel import. */
  group: z.string().max(200).default(''),
  preconditions: z.string().default(''),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  steps: z.array(ManualStepSchema).default([]),
  /** The automatic test that replaces this case once it is recorded. */
  automatedTestId: z.string().min(1).nullish(),
  /** Id in the source file when imported from Excel (so a re-import updates, not duplicates). */
  externalId: z.string().max(100).optional(),
});
export type ManualCase = z.infer<typeof ManualCaseSchema>;

export const ManualCasesSchema = z.array(ManualCaseSchema).superRefine((all, ctx) => {
  const seen = new Set<string>();
  for (const [i, c] of all.entries()) {
    if (seen.has(c.id))
      ctx.addIssue({ code: 'custom', message: `Duplicate case id "${c.id}"`, path: [i, 'id'] });
    seen.add(c.id);
  }
});

/** Overall result of a case from its steps: any fail → fail, else any blocked → blocked, ... */
export function manualCaseStatus(c: Pick<ManualCase, 'steps'>): ManualStatus {
  const s = c.steps.map((x) => x.status);
  if (s.includes('fail')) return 'fail';
  if (s.includes('blocked')) return 'blocked';
  if (s.length > 0 && s.every((x) => x === 'pass')) return 'pass';
  return 'untested';
}

/** Marks every step of the case with one result (e.g. "all passed"). */
export function markAll(c: ManualCase, status: ManualStatus): ManualCase {
  return { ...c, steps: c.steps.map((x) => ({ ...x, status })) };
}

/**
 * Turns a manual case into the first lines of an automatic test: one comment-like
 * note per step so the person can record each part (the "move to automatic" path).
 */
export function manualCaseOutline(
  c: ManualCase,
): { index: number; action: string; expected: string }[] {
  return c.steps.map((s, index) => ({ index: index + 1, action: s.action, expected: s.expected }));
}

/**
 * Brings imported cases into the project's cases. A case whose `externalId` already exists is
 * updated (its text replaced; results of steps whose text did not change are kept), others are added.
 */
export function mergeImported(
  existing: ManualCase[],
  imported: ManualCase[],
): { cases: ManualCase[]; added: number; updated: number } {
  const out = [...existing];
  let added = 0;
  let updated = 0;
  for (const inc of imported) {
    const at = inc.externalId ? out.findIndex((c) => c.externalId === inc.externalId) : -1;
    const old = at >= 0 ? out[at] : undefined;
    if (!old) {
      out.push(inc);
      added++;
      continue;
    }
    out[at] = {
      ...old,
      name: inc.name,
      group: inc.group,
      priority: inc.priority,
      preconditions: inc.preconditions,
      steps: inc.steps.map((s, i) => {
        const was = old.steps[i];
        return was && was.action === s.action && was.expected === s.expected
          ? was
          : { ...s, id: was?.id ?? s.id };
      }),
    };
    updated++;
  }
  return { cases: out, added, updated };
}

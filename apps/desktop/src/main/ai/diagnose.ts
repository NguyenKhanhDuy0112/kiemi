import { parseProposal } from '@kiemi/ai';
import { DbError, type Services } from '@kiemi/db';
import { checkSteps, createDefaultRegistry } from '@kiemi/engine';
import type { RunError, Step } from '@kiemi/schema';
import { z } from 'zod';
import { gatewayFor, guardAndLog } from './gateway';

/** Why a test failed, from the tester's point of view [AI-10]. */
export const FAIL_CATEGORIES = ['realBug', 'uiChanged', 'data', 'environment', 'flaky'] as const;
export type FailCategory = (typeof FAIL_CATEGORIES)[number];

const AnswerSchema = z.object({
  category: z.enum(FAIL_CATEGORIES),
  explanation: z.string().max(2000),
  /** New params for the failed step, when a change would fix it [AI-09, FX-12]. */
  fix: z
    .object({ params: z.record(z.string(), z.unknown()), why: z.string().max(500).default('') })
    .nullish(),
});

export interface Diagnosis {
  category: FailCategory;
  explanation: string;
  fix: {
    stepId: string;
    why: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    /** Other steps of the test that point at the same element and would change too. */
    alsoSteps: string[];
  } | null;
}

const registry = createDefaultRegistry();

/** Flattens nested steps (if/loop/…) so a step can be found by id anywhere. */
function allSteps(steps: readonly Step[]): Step[] {
  const out: Step[] = [];
  const walk = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const s of list as Step[]) {
      out.push(s);
      for (const v of Object.values(s.params ?? {})) walk(v);
    }
  };
  walk(steps);
  return out;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Latest results of a test, newest first, to tell "always fails" from "sometimes fails". */
function recentStatuses(s: Services, projectId: string, testCaseId: string): string[] {
  const out: string[] = [];
  for (const run of s.runs.history(projectId, { testCaseId, limit: 10 })) {
    for (const c of s.runs.listCases(run.id))
      if (c.testCaseId === testCaseId && ['passed', 'failed', 'error'].includes(c.status))
        out.push(c.status);
  }
  return out.slice(0, 10);
}

export interface DiagnoseInput {
  testCaseId: string;
  stepId: string;
  error: Pick<RunError, 'code' | 'message' | 'details'>;
  environmentName?: string | null;
  /** Text of the page, when the browser is still open (from `recorder.pageContext`). */
  pageText?: string | undefined;
}

/**
 * Sorts a failure into one of five causes and, when the step itself is stale (a moved or
 * renamed element, a changed text), proposes new params as a diff. Nothing is changed [AI-09, AI-10].
 */
export async function diagnose(
  s: Services,
  projectId: string,
  input: DiagnoseInput,
): Promise<Diagnosis> {
  const test = s.testCases.get(input.testCaseId);
  if (test.projectId !== projectId)
    throw new DbError('NOT_FOUND', 'Test not found', { entity: 'test case' });
  const steps = allSteps(test.content.steps);
  const step = steps.find((x) => x.id === input.stepId);
  if (!step) throw new DbError('NOT_FOUND', 'Step not found', { entity: 'step' });

  const history = recentStatuses(s, projectId, input.testCaseId);
  const system = [
    'You are Kiemi Assistant, helping a tester who cannot code to understand a failed UI test step. Answer in Vietnamese.',
    'Reply with ONE JSON object: {"category": "realBug"|"uiChanged"|"data"|"environment"|"flaky", "explanation": short text, "fix": null | {"params": the full new params of the failed step, "why": short text}}.',
    'realBug: the page behaves wrongly. uiChanged: the page changed (renamed, moved, restyled element) and the step is stale. data: the test data is wrong or used up. environment: server, network, login or permission problem. flaky: results alternate between pass and fail.',
    'Propose "fix" only when changing this step fixes it (new locator from the element\'s fingerprint, new expected text). Keep the same action. Never invent secrets.',
  ].join('\n');
  const message = [
    `Failed step ${input.stepId}: ${JSON.stringify({ action: step.action, params: step.params })}`,
    `Error: ${input.error.code} — ${input.error.message}`,
    input.error.details ? `Details: ${JSON.stringify(input.error.details).slice(0, 4000)}` : '',
    `Environment: ${input.environmentName ?? 'unknown'}`,
    `Last results of this test (newest first): ${history.join(', ') || 'none'}`,
    `Test steps: ${JSON.stringify(steps.map((x) => ({ id: x.id, action: x.action, params: x.params }))).slice(0, 8000)}`,
    input.pageText ? `Page now:\n${input.pageText.slice(0, 12000)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await gatewayFor(s, projectId).ask({
    task: 'classify',
    system,
    messages: [{ role: 'user', content: message }],
  });
  const parsed = parseProposal(res.text, AnswerSchema);
  if (!parsed.ok)
    return { category: 'realBug', explanation: res.text.trim().slice(0, 2000), fix: null };

  const { category, explanation, fix } = parsed.value;
  let out: Diagnosis['fix'] = null;
  if (fix && !same(fix.params, step.params)) {
    // The fixed step must still be inside the catalog.
    const problems = checkSteps(registry, [{ ...step, params: fix.params }]);
    if (!problems.length) {
      const target = (step.params as Record<string, unknown>).target;
      const also =
        target === undefined
          ? []
          : steps
              .filter(
                (x) =>
                  x.id !== step.id && same((x.params as Record<string, unknown>).target, target),
              )
              .map((x) => x.id);
      out = {
        stepId: step.id,
        why: fix.why,
        before: step.params,
        after: fix.params,
        alsoSteps: also,
      };
    }
  }
  guardAndLog(s, projectId, { kind: 'propose' }, { approved: false }, `diagnose ${category}`);
  return { category, explanation, fix: out };
}

/** Replaces `target` (when it changed) in the same-element steps listed with the fix. */
function retarget(params: Record<string, unknown>, target: unknown): Record<string, unknown> {
  return { ...params, target };
}

/**
 * The person pressed "apply" on a proposed fix. The step (and, with `alsoSameTarget`, the
 * steps that pointed at the same element) get the new params; the test is saved [AI-09, AI-21].
 */
export function applyFix(
  s: Services,
  projectId: string,
  input: {
    testCaseId: string;
    stepId: string;
    params: Record<string, unknown>;
    alsoSameTarget: boolean;
  },
): { updated: string[] } {
  const test = s.testCases.get(input.testCaseId);
  if (test.projectId !== projectId)
    throw new DbError('NOT_FOUND', 'Test not found', { entity: 'test case' });
  const content = structuredClone(test.content);
  const steps = allSteps(content.steps);
  const step = steps.find((x) => x.id === input.stepId);
  if (!step) throw new DbError('NOT_FOUND', 'Step not found', { entity: 'step' });
  const oldTarget = (step.params as Record<string, unknown>).target;
  const problems = checkSteps(registry, [{ ...step, params: input.params }]);
  if (problems.length)
    throw new DbError('VALIDATION', problems.map((p) => p.message).join('; '), {
      entity: 'step',
    });

  const updated = [step.id];
  const newTarget = input.params.target;
  if (input.alsoSameTarget && oldTarget !== undefined && newTarget !== undefined) {
    for (const x of steps) {
      if (x.id !== step.id && same((x.params as Record<string, unknown>).target, oldTarget)) {
        x.params = retarget(x.params as Record<string, unknown>, newTarget);
        updated.push(x.id);
      }
    }
  }
  step.params = input.params;
  guardAndLog(s, projectId, { kind: 'save' }, { approved: true }, `fix ${updated.join(',')}`);
  s.testCases.save(test.id, content, test.version);
  return { updated };
}

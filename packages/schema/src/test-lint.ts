import type { Step } from './step';
import type { TestCase } from './test-case';

export const LINT_RULES = [
  'noAssertion',
  'fixedWait',
  'weakSelector',
  'noCleanup',
  'tooLong',
  'duplicate',
  'hardCodedData',
] as const;
export type LintRule = (typeof LINT_RULES)[number];

/** What the quick-fix button does; none = the explanation is the help. */
export type LintFix = { kind: 'removeStep'; stepId: string } | { kind: 'none' };

export interface LintWarning {
  rule: LintRule;
  stepId?: string;
  /** Values for the explanation text, e.g. `{ count: 63 }`. */
  params: Record<string, string | number>;
  fix: LintFix;
}

/** Steps above this are "too long" (split into shared steps). */
export const MAX_STEPS = 40;

/** Every step, also those nested in groups (if / loop / …), in order. */
export function allSteps(steps: readonly unknown[]): Step[] {
  const out: Step[] = [];
  const walk = (list: readonly unknown[]): void => {
    for (const s of list) {
      if (!s || typeof s !== 'object') continue;
      const step = s as Step & Record<string, unknown>;
      if (typeof step.action === 'string') out.push(step);
      for (const k of Object.keys(step)) {
        const v = step[k];
        if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'action' in x)) walk(v);
      }
    }
  };
  walk(steps);
  return out;
}

/** A selector that breaks when the page layout changes: positions, long chains, absolute XPath. */
export function isWeakStrategy(kind: string, value: string): boolean {
  if (kind === 'xpath') return /^\/(html|\/?\*?\[)/.test(value) || /\[\d+\]/.test(value);
  if (kind !== 'css') return false;
  if (/^#[\w-]+$/.test(value) || /\[(data-testid|data-test|name|id)=/.test(value)) return false;
  return /nth-child|nth-of-type|:first|:last/.test(value) || value.split(/[\s>]+/).length >= 4;
}

function weakTargets(step: Step): boolean {
  const target = (step.params as { target?: { strategies?: { kind: string; value?: string }[] } })
    .target;
  const list = target?.strategies;
  if (!list?.length) return false;
  // Weak only when every strategy is weak: a good one first or second is enough.
  return list.every((s) => isWeakStrategy(s.kind, s.value ?? ''));
}

const signature = (tc: Pick<TestCase, 'steps'>): string =>
  JSON.stringify(allSteps(tc.steps).map((s) => [s.action, s.params]));

/** The test without step `id` (also inside groups). */
export function removeStep(tc: TestCase, id: string): TestCase {
  const strip = (list: unknown[]): unknown[] =>
    list
      .filter((s) => (s as { id?: string }).id !== id)
      .map((s) => {
        if (!s || typeof s !== 'object') return s;
        const o: Record<string, unknown> = { ...(s as Record<string, unknown>) };
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'action' in x))
            o[k] = strip(v);
        }
        return o;
      });
  return { ...tc, steps: strip(tc.steps) as TestCase['steps'] };
}

/** Signatures of other tests, to spot duplicates: `{ id → signature }`. */
export const signatureOf = signature;

/**
 * Quality warnings of one test, each with a reason and, when possible, a quick
 * fix [CV-07]. `others` = signatures of the project's other tests.
 */
export function lintTest(tc: TestCase, others: Record<string, string> = {}): LintWarning[] {
  const out: LintWarning[] = [];
  const steps = allSteps(tc.steps).filter((s) => s.enabled !== false);
  if (steps.length === 0) return out;

  if (!steps.some((s) => s.action.startsWith('assert') || s.action === 'waitUntil'))
    out.push({ rule: 'noAssertion', params: {}, fix: { kind: 'none' } });

  for (const s of steps) {
    if (s.action === 'wait')
      out.push({
        rule: 'fixedWait',
        stepId: s.id,
        params: { seconds: String(s.params.seconds ?? '') },
        fix: { kind: 'removeStep', stepId: s.id },
      });
    if (weakTargets(s))
      out.push({ rule: 'weakSelector', stepId: s.id, params: {}, fix: { kind: 'none' } });
  }

  const writes = steps.some(
    (s) => s.action === 'fill' || s.action === 'upload' || s.action === 'api',
  );
  if (writes && tc.cleanup.length === 0 && !tc.tags.includes('negative'))
    out.push({ rule: 'noCleanup', params: {}, fix: { kind: 'none' } });

  if (steps.length > MAX_STEPS)
    out.push({
      rule: 'tooLong',
      params: { count: steps.length, max: MAX_STEPS },
      fix: { kind: 'none' },
    });

  const mine = signature(tc);
  const twin = Object.entries(others).find(
    ([id, sig]) => id !== tc.id && sig === mine && mine !== '[]',
  );
  if (twin) out.push({ rule: 'duplicate', params: {}, fix: { kind: 'none' } });

  // Typed data that is neither a variable nor a column: generated form tests are exempt.
  if (!tc.tags.includes('form-validation')) {
    for (const s of steps) {
      const v = s.params.value;
      if (
        s.action === 'fill' &&
        typeof v === 'string' &&
        v.trim() !== '' &&
        !v.includes('{{') &&
        (/@/.test(v) || /^\+?\d[\d\s.-]{6,}$/.test(v))
      )
        out.push({
          rule: 'hardCodedData',
          stepId: s.id,
          params: { value: v },
          fix: { kind: 'none' },
        });
    }
  }
  return out;
}

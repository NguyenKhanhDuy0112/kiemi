import { BUILTIN_RULES, QUALITY_CHARS, type Step, StepSchema, TECHNIQUES } from '@kiemi/schema';
import { z } from 'zod';
import type { ActionRegistry } from './define-action';

/** One action as the assistant sees it. */
export interface KnowledgeAction {
  type: string;
  group: string;
  /** Label key, translated by the caller. */
  labelKey: string;
  label: string;
  /** Holds nested steps (if/loop/…). */
  container: boolean;
  /** JSON Schema of `params`. */
  params: unknown;
}

export interface Knowledge {
  actions: KnowledgeAction[];
  techniques: readonly string[];
  qualityChars: readonly string[];
  rules: { id: string; appliesTo: readonly string[] }[];
}

/** How a step is written; kept short because it goes into every prompt. */
export const STEP_GUIDE = `A test is a list of steps. Each step: {"id": unique string, "action": one type from the catalog, "params": object valid for that action, "session": "default", "mode": "hard"|"soft"}.
Use variables as {{name}} and data columns as {{row.column}}. Never write real passwords: use secrets as {{secret.name}}.
Elements are described by role+name, label, placeholder, text, test id, then css (in this order of preference).
Only use actions of the catalog. Every test should assert something and avoid fixed waits.`;

function paramsSchema(schema: z.ZodType): unknown {
  try {
    return z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' });
  } catch {
    return {};
  }
}

/**
 * The catalog the assistant may build steps from, read from the live registry each time:
 * add an action and the assistant knows it, with no prompt to edit [AI-15].
 */
export function buildKnowledge(
  registry: ActionRegistry,
  label: (key: string) => string = (k) => k,
): Knowledge {
  return {
    actions: registry
      .list()
      .map((a) => ({
        type: a.type,
        group: a.ui.group,
        labelKey: a.ui.label,
        label: label(a.ui.label),
        container: a.container === true,
        params: paramsSchema(a.params),
      }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    techniques: TECHNIQUES,
    qualityChars: QUALITY_CHARS,
    rules: BUILTIN_RULES.map((r) => ({ id: r.id, appliesTo: r.appliesTo })),
  };
}

/** The knowledge as text for the system prompt. */
export function knowledgeText(k: Knowledge): string {
  const actions = k.actions
    .map(
      (a) =>
        `- ${a.type} (${a.group}${a.container ? ', container' : ''}): ${a.label} ${JSON.stringify(a.params)}`,
    )
    .join('\n');
  return [
    STEP_GUIDE,
    `Action catalog:\n${actions}`,
    `Design techniques: ${k.techniques.join(', ')}.`,
    `Quality characteristics: ${k.qualityChars.join(', ')}.`,
    `Ready-made field rules: ${k.rules.map((r) => r.id).join(', ')}.`,
  ].join('\n\n');
}

export interface StepProblem {
  /** Path like `3` or `3.1` (nested), 1-based. */
  at: string;
  message: string;
}

/** True when the value at `path` is text with a `{{variable}}`, filled in only at run time. */
function usesVariable(root: unknown, path: readonly PropertyKey[]): boolean {
  let v: unknown = root;
  for (const k of path) {
    if (v === null || typeof v !== 'object') return false;
    v = (v as Record<PropertyKey, unknown>)[k];
  }
  return typeof v === 'string' && v.includes('{{');
}

/**
 * Checks steps written by the assistant: known action, valid params. Nested steps in
 * `then`/`else`/`steps`/`body` params are checked too [AI-15, AI-03].
 */
export function checkSteps(registry: ActionRegistry, steps: unknown, prefix = ''): StepProblem[] {
  if (!Array.isArray(steps)) return [{ at: prefix || '0', message: 'steps must be a list' }];
  const out: StepProblem[] = [];
  steps.forEach((raw, i) => {
    const at = `${prefix}${i + 1}`;
    const shape = StepSchema.safeParse(raw);
    if (!shape.success) {
      out.push({ at, message: shape.error.issues.map((x) => x.message).join('; ') });
      return;
    }
    const step: Step = shape.data;
    const def = registry.get(step.action);
    if (!def) {
      out.push({ at, message: `Unknown action "${step.action}"` });
      return;
    }
    const p = def.params.safeParse(step.params);
    if (!p.success) {
      const real = p.error.issues.filter(
        (x: z.core.$ZodIssue) => !usesVariable(step.params, x.path),
      );
      if (real.length)
        out.push({
          at,
          message: real
            .map((x: z.core.$ZodIssue) => `${x.path.join('.') || 'params'}: ${x.message}`)
            .join('; '),
        });
    }
    // Nested steps live in array params whose items have an `action` (then/else/loop bodies…).
    for (const value of Object.values(step.params)) {
      if (Array.isArray(value) && value.some((v) => v && typeof v === 'object' && 'action' in v))
        out.push(...checkSteps(registry, value, `${at}.`));
    }
  });
  return out;
}

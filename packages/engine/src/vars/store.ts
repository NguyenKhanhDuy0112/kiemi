import type { DataRow, Env, Secrets } from '@kiemi/schema';
import { EngineError } from '../errors';
import { AppValue, appNamespace, mainAppUrl, mainProductKey } from './app';
import {
  type EvalEnv,
  evaluateExpression,
  type NamedFormula,
  stringify,
  type TraceStep,
} from './evaluate';

export interface VariableScopes {
  env?: Env | undefined;
  /** Suite-level variables. */
  suite?: Record<string, string> | undefined;
  /** Test-level variables (`TestCase.variables`). */
  test?: Record<string, string> | undefined;
  /** Current dataset row (`{{row.col}}`) [E-03]. */
  row?: DataRow | undefined;
  secrets?: Secrets | undefined;
  /** Main product of the test (`TestCase.product`) for `{{app}}` [O-02]. */
  product?: string | undefined;
  /** Inherited levels [O-04]: workspace → project → product (then environment…). */
  workspace?: Record<string, string> | undefined;
  project?: Record<string, string> | undefined;
  productVariables?: Record<string, string> | undefined;
  /** Linked child rows of the current data row by table name: `{{children.SanPham}}` [P-01]. */
  children?: Record<string, DataRow[]> | undefined;
  /** Named formulas usable as `{{Ten(a, b)}}` [P-03]. */
  formulas?: Readonly<Record<string, NamedFormula>> | undefined;
}

/** Where a bare `{{name}}` comes from, most specific first [O-04]. */
export const VARIABLE_LEVELS = [
  'row',
  'test',
  'suite',
  'cell',
  'environment',
  'product',
  'project',
  'workspace',
] as const;
export type VariableLevel = (typeof VARIABLE_LEVELS)[number];

/** Values of each level, from the scopes of a run. */
export function variableLevels(s: VariableScopes): Record<VariableLevel, Record<string, string>> {
  const key = mainProductKey(s.env, s.product);
  const cell = key === undefined ? undefined : s.env?.apps[key];
  return {
    row: { ...(s.row ?? {}) } as Record<string, string>,
    test: s.test ?? {},
    suite: s.suite ?? {},
    cell: cell && !cell.missing ? cell.variables : {},
    environment: s.env?.variables ?? {},
    product: s.productVariables ?? {},
    project: s.project ?? {},
    workspace: s.workspace ?? {},
  };
}

export interface EffectiveVariable {
  name: string;
  /** Raw value (may hold `{{…}}`) of the level that wins. */
  value: string;
  level: VariableLevel;
  /** Less specific levels that also declare it (overridden). */
  overridden: { level: VariableLevel; value: string }[];
}

/** "Giá trị hiệu lực": every variable with the level it comes from [O-04]. */
export function explainVariables(s: VariableScopes): EffectiveVariable[] {
  const levels = variableLevels(s);
  const names = new Set<string>();
  for (const l of VARIABLE_LEVELS) for (const n of Object.keys(levels[l])) names.add(n);
  const out: EffectiveVariable[] = [];
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const hits = VARIABLE_LEVELS.filter((l) => Object.hasOwn(levels[l], name)).map((l) => ({
      level: l,
      value: String(levels[l][name]),
    }));
    const [win, ...rest] = hits;
    if (win) out.push({ name, value: win.value, level: win.level, overridden: rest });
  }
  return out;
}

const TEMPLATE = /\{\{([\s\S]+?)\}\}/g;
const MAX_DEPTH = 5;

/**
 * Variables of one run [E-01, E-02]. Bare names are looked up
 * runtime (saved from the page) → loop/shared-step frames → test → suite → env.
 * Namespaces: `app`, `app.<product>`, `app.<product>.x` [O-02], `env.x`, `secret.x` [E-08], `row.x`, `param.x` (shared step args), `loop.x`.
 */
export class VariableStore {
  readonly #scopes: VariableScopes;
  readonly #runtime = new Map<string, unknown>();
  readonly #frames: Record<string, unknown>[] = [];
  readonly #now: () => Date;
  #depth = 0;

  constructor(scopes: VariableScopes = {}, now: () => Date = () => new Date()) {
    this.#scopes = scopes;
    this.#now = now;
  }

  /** Saves a runtime value (e.g. extracted from the page) [E-04]. */
  set(name: string, value: unknown): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new EngineError('INVALID_PARAMS', `Invalid variable name "${name}"`, { name });
    }
    this.#runtime.set(name, value);
  }

  get(name: string): unknown {
    const hit = this.#lookup(name);
    return hit.found ? hit.value : undefined;
  }

  has(name: string): boolean {
    return this.#lookup(name).found;
  }

  /** Runtime variables saved so far. */
  runtime(): Record<string, unknown> {
    return Object.fromEntries(this.#runtime);
  }

  /** Runs `fn` with extra names visible (shared-step params, loop item). */
  async withFrame<T>(frame: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    this.#frames.push(frame);
    try {
      return await fn();
    } finally {
      this.#frames.pop();
    }
  }

  /** Every secret value, longest first, for masking logs and reports [E-08]. */
  secretValues(): string[] {
    return Object.values(this.#scopes.secrets ?? {})
      .filter((v) => v.length > 0)
      .sort((a, b) => b.length - a.length);
  }

  /**
   * Replaces `{{…}}` in strings, deeply in arrays/objects. A string that is a
   * single `{{expr}}` keeps the value's type (number, object…). Keys listed in
   * `raw` (top level only) are left untouched — e.g. nested step lists.
   */
  interpolate<T>(value: T, raw: readonly string[] = []): T {
    return this.#walk(value, raw, true) as T;
  }

  /** Renders a template to text. */
  render(template: string): string {
    return stringify(this.#renderValue(template));
  }

  /** Evaluates a bare expression (no braces), e.g. a loop count. */
  evaluate(expression: string): unknown {
    return evaluateExpression(expression, this.#env());
  }

  /** Evaluates an expression and returns every intermediate result (debug view) [P-03]. */
  explain(expression: string): { value: unknown; steps: TraceStep[] } {
    const steps: TraceStep[] = [];
    const value = evaluateExpression(expression, {
      ...this.#env(),
      trace: (s) => steps.push(s),
    });
    return { value, steps };
  }

  #walk(value: unknown, raw: readonly string[], top: boolean): unknown {
    if (typeof value === 'string') return value.includes('{{') ? this.#renderValue(value) : value;
    if (Array.isArray(value)) return value.map((v) => this.#walk(v, [], false));
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = top && raw.includes(k) ? v : this.#walk(v, [], false);
      }
      return out;
    }
    return value;
  }

  #renderValue(template: string): unknown {
    if (++this.#depth > MAX_DEPTH) {
      this.#depth = 0;
      throw new EngineError('INVALID_EXPRESSION', 'Variables reference each other in a loop', {
        template,
      });
    }
    try {
      const single = /^\{\{([\s\S]+?)\}\}$/.exec(template);
      if (single?.[1] !== undefined && !single[1].includes('{{')) {
        const v = evaluateExpression(single[1], this.#env());
        return v instanceof Date || v instanceof AppValue ? stringify(v) : v;
      }
      return template.replace(TEMPLATE, (_m, expr: string) =>
        stringify(evaluateExpression(expr, this.#env())),
      );
    } finally {
      this.#depth--;
    }
  }

  #env(): EvalEnv {
    return {
      lookup: (n) => this.#lookup(n),
      now: this.#now(),
      formulas: this.#scopes.formulas,
      locale: this.#scopes.env?.locale,
    };
  }

  /** Values from env/suite/test/data may themselves contain templates. */
  #expand(v: unknown): unknown {
    return typeof v === 'string' && v.includes('{{') ? this.#renderValue(v) : v;
  }

  #lookup(name: string): { found: true; value: unknown } | { found: false } {
    const s = this.#scopes;
    const ok = (value: unknown) => ({ found: true as const, value });
    switch (name) {
      case 'env': {
        // Getters: a variable is expanded only when used (no self-recursion).
        const vars: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s.env?.variables ?? {})) {
          Object.defineProperty(vars, k, { enumerable: true, get: () => this.#expand(v) });
        }
        // `{{env.baseUrl}}` (v1.0) = the main product's URL [ADR 0018 §6].
        const baseUrl = mainAppUrl(s.env, s.product);
        if (baseUrl !== undefined) vars.baseUrl = baseUrl;
        if (s.env?.name !== undefined) vars.name = s.env.name;
        return ok(vars);
      }
      case 'app':
        return ok(appNamespace(s.env, s.product, (v) => this.#expand(v)));
      case 'children':
        return ok({ ...(s.children ?? {}) });
      case 'secret':
        return ok({ ...(s.secrets ?? {}) });
      case 'row':
        return ok({ ...(s.row ?? {}) });
      case 'param':
      case 'loop':
        for (let i = this.#frames.length - 1; i >= 0; i--) {
          const f = this.#frames[i] as Record<string, unknown>;
          if (Object.hasOwn(f, name)) return ok(f[name]);
        }
        return { found: false };
    }
    if (this.#runtime.has(name)) return ok(this.#runtime.get(name));
    for (let i = this.#frames.length - 1; i >= 0; i--) {
      const f = this.#frames[i] as Record<string, unknown>;
      const vars = f.vars as Record<string, unknown> | undefined;
      if (vars && Object.hasOwn(vars, name)) return ok(vars[name]);
    }
    // Inherited levels, most specific first [O-04]. Data row values are plain text.
    if (s.row && Object.hasOwn(s.row, name)) return ok(s.row[name]);
    const levels = variableLevels(s);
    for (const level of VARIABLE_LEVELS) {
      if (level === 'row') continue;
      const scope = levels[level];
      if (Object.hasOwn(scope, name)) return ok(this.#expand(scope[name]));
    }
    return { found: false };
  }
}

/** Replaces every secret value in `text` with `••••` [E-08]. */
export function maskSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join('••••');
  return out;
}

import { EngineError } from '../errors';
import { AppValue } from './app';
import { addDuration, formatDate, parseDate } from './dates';
import { type Duration, type Node, nodeText, parseExpression } from './expression';
import { FAKE, GENERATORS, randomInt, randomString } from './generators';
import { SHEET_FUNCTIONS, truthy } from './sheet';
import {
  compareValues,
  formatMoney,
  formatNumber,
  type Locale,
  stringify,
  toNumber,
} from './values';

export { stringify, toNumber };

/** Resolves the first segment of a path (`row`, `env`, `maDon`…); `undefined` = unknown. */
export type Lookup = (name: string) => { found: true; value: unknown } | { found: false };

/** A formula with a name and inputs, defined once and used anywhere [P-03]. */
export interface NamedFormula {
  params: readonly string[];
  expression: string;
}

/** One intermediate result while evaluating, for the debug view [P-03]. */
export interface TraceStep {
  text: string;
  value: unknown;
  depth: number;
}

export interface EvalEnv {
  lookup: Lookup;
  now: Date;
  /** Named formulas by name (case-insensitive) [P-03]. */
  formulas?: Readonly<Record<string, NamedFormula>> | undefined;
  /** Receives every operation result, innermost first. */
  trace?: ((step: TraceStep) => void) | undefined;
  /** Reading/writing of numbers and money, from the environment [P-10]. */
  locale?: Locale | undefined;
  /** Nesting of named formulas (guards recursion). */
  depth?: number;
}

const isDuration = (v: unknown): v is Duration =>
  typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'duration';

function fail(
  code: 'UNKNOWN_VARIABLE' | 'INVALID_EXPRESSION',
  message: string,
  details: Record<string, unknown>,
) {
  return new EngineError(code, message, details);
}

function num(v: unknown, op: string, locale?: Locale): number {
  const n = toNumber(v, locale);
  if (n === undefined)
    throw fail('INVALID_EXPRESSION', `"${stringify(v)}" is not a number (${op})`, {
      value: stringify(v),
      op,
    });
  return n;
}

const FUNCTIONS: Record<string, (args: unknown[], env: EvalEnv) => unknown> = {
  floor: ([x]) => Math.floor(num(x, 'floor')),
  ceil: ([x]) => Math.ceil(num(x, 'ceil')),
  abs: ([x]) => Math.abs(num(x, 'abs')),
  number: ([x], env) => num(x, 'number', env.locale),
  /** `parseNumber('1.250.000 ₫')` → 1250000 (reads by the environment's locale). */
  parseNumber: ([x], env) => num(x, 'parseNumber', env.locale),
  /** `formatNumber(1250000)` → `1.250.000` (`vi`) / `1,250,000` (`en`); optional decimals. */
  formatNumber: ([x, d], env) =>
    formatNumber(
      num(x, 'formatNumber', env.locale),
      env.locale,
      d === undefined ? undefined : num(d, 'formatNumber'),
    ),
  /** `formatMoney(1250000)` → `1.250.000 ₫` (`vi`) / `₫1,250,000` (`en`). */
  formatMoney: ([x], env) => formatMoney(num(x, 'formatMoney', env.locale), env.locale),
  random: ([a, b]) =>
    a === undefined
      ? randomInt(100000, 999999)
      : b === undefined
        ? randomInt(0, num(a, 'random'))
        : randomInt(num(a, 'random'), num(b, 'random')),
  randomString: ([n]) => randomString(n === undefined ? 8 : num(n, 'randomString')),
  randomDigits: ([n]) => randomString(n === undefined ? 6 : num(n, 'randomDigits'), '0123456789'),
  upper: ([s]) => stringify(s).toUpperCase(),
  lower: ([s]) => stringify(s).toLowerCase(),
  trim: ([s]) => stringify(s).trim(),
  len: ([s]) => (Array.isArray(s) ? s.length : stringify(s).length),
  concat: (a) => a.map(stringify).join(''),
  format: ([d, p]) => {
    const date = d instanceof Date ? d : parseDate(stringify(d));
    if (!date)
      throw fail('INVALID_EXPRESSION', `"${stringify(d)}" is not a date`, { value: stringify(d) });
    return formatDate(date, p === undefined ? undefined : stringify(p));
  },
  date: ([s, p]) => {
    const d = parseDate(stringify(s), p === undefined ? undefined : stringify(p));
    if (!d)
      throw fail('INVALID_EXPRESSION', `"${stringify(s)}" is not a date`, { value: stringify(s) });
    return d;
  },
};

const MAX_FORMULA_DEPTH = 8;

const FUNCTION_TABLE = new Map<string, (args: unknown[], env: EvalEnv) => unknown>(
  Object.entries({ ...FUNCTIONS, ...SHEET_FUNCTIONS }).map(([k, v]) => [k.toLowerCase(), v]),
);

/** Evaluates one node; with `env.trace` every operation reports its result [P-03]. */
export function evaluate(node: Node, env: EvalEnv): unknown {
  const value = evalNode(node, env);
  if (
    env.trace &&
    (node.t === 'bin' || node.t === 'call' || node.t === 'neg' || node.t === 'cmp')
  ) {
    env.trace({ text: nodeText(node), value, depth: env.depth ?? 0 });
  }
  return value;
}

function callFormula(f: NamedFormula, name: string, args: unknown[], env: EvalEnv): unknown {
  const depth = (env.depth ?? 0) + 1;
  if (depth > MAX_FORMULA_DEPTH)
    throw fail('INVALID_EXPRESSION', `Formula "${name}" calls itself too deeply`, {
      formula: name,
    });
  if (args.length !== f.params.length)
    throw fail(
      'INVALID_EXPRESSION',
      `Formula "${name}" takes ${f.params.length} input(s) (${f.params.join(', ')}), got ${args.length}`,
      { formula: name },
    );
  const bound = new Map(f.params.map((p, i) => [p, args[i]]));
  const inner: EvalEnv = {
    ...env,
    depth,
    lookup: (n) => (bound.has(n) ? { found: true, value: bound.get(n) } : env.lookup(n)),
  };
  return evaluateExpression(f.expression, inner);
}

function walk(start: unknown, root: string, parts: (string | Node)[], env: EvalEnv): unknown {
  let value = start;
  let name = root;
  for (const part of parts) {
    const key = typeof part === 'string' ? part : stringify(evaluate(part, env));
    name += `.${key}`;
    if (value !== null && typeof value === 'object' && Object.hasOwn(value, key)) {
      value = (value as Record<string, unknown>)[key];
    } else if (value instanceof AppValue && name === `app.${key}`) {
      throw new EngineError('UNKNOWN_PRODUCT', `Unknown product "${key}"`, { product: key });
    } else {
      throw fail('UNKNOWN_VARIABLE', `Unknown variable "${name}"`, { name });
    }
  }
  return value;
}

function evalNode(node: Node, env: EvalEnv): unknown {
  switch (node.t) {
    case 'num':
    case 'str':
    case 'dur':
      return node.v;
    case 'neg':
      return -num(evaluate(node.e, env), '-', env.locale);
    case 'cmp':
      return compareValues(evaluate(node.l, env), node.op, evaluate(node.r, env));
    case 'call': {
      const lname = node.name.toLowerCase();
      const formula = Object.entries(env.formulas ?? {}).find(([k]) => k.toLowerCase() === lname);
      if (formula)
        return callFormula(
          formula[1],
          formula[0],
          node.args.map((a) => evaluate(a, env)),
          env,
        );
      if (lname === 'if') {
        // Lazy: only the chosen branch runs (no division by zero in the other).
        const [c, yes, no] = node.args;
        if (!c || !yes)
          throw fail('INVALID_EXPRESSION', 'IF needs a condition and a value', { function: 'IF' });
        if (truthy(evaluate(c, env))) return evaluate(yes, env);
        return no ? evaluate(no, env) : '';
      }
      const fn = FUNCTION_TABLE.get(lname);
      if (!fn) {
        throw fail('INVALID_EXPRESSION', `Unknown function "${node.name}"`, {
          function: node.name,
        });
      }
      return fn(
        node.args.map((a) => evaluate(a, env)),
        env,
      );
    }
    case 'path': {
      let value: unknown;
      const parts = [...node.parts];
      if (node.root === 'fake') {
        const kind = parts.shift();
        const gen = typeof kind === 'string' ? FAKE[kind] : undefined;
        if (!gen)
          throw fail('UNKNOWN_VARIABLE', `Unknown generator "fake.${String(kind)}"`, {
            name: `fake.${String(kind)}`,
          });
        value = gen();
      } else {
        const hit = env.lookup(node.root);
        if (hit.found) value = hit.value;
        else if (Object.hasOwn(GENERATORS, node.root)) value = GENERATORS[node.root]?.(env.now);
        else throw fail('UNKNOWN_VARIABLE', `Unknown variable "${node.root}"`, { name: node.root });
      }
      return walk(value, node.root, parts, env);
    }
    case 'member':
      return walk(evaluate(node.base, env), nodeText(node.base), node.parts, env);
    case 'bin': {
      const l = evaluate(node.l, env);
      const r = evaluate(node.r, env);
      if (node.op === '&') return stringify(l) + stringify(r);
      if (l instanceof Date && isDuration(r) && (node.op === '+' || node.op === '-')) {
        return addDuration(l, r, node.op === '+' ? 1 : -1);
      }
      if (node.op === '+') {
        const a = toNumber(l, env.locale);
        const b = toNumber(r, env.locale);
        return a !== undefined && b !== undefined ? a + b : stringify(l) + stringify(r);
      }
      const a = num(l, node.op, env.locale);
      const b = num(r, node.op, env.locale);
      if (node.op === '-') return a - b;
      if (node.op === '*') return a * b;
      if ((node.op === '/' || node.op === '%') && b === 0) {
        throw fail('INVALID_EXPRESSION', 'Division by zero', { op: node.op });
      }
      return node.op === '/' ? a / b : a % b;
    }
  }
}

const cache = new Map<string, Node>();

/** Evaluates `expr` with an optional `| format` suffix for dates/numbers. */
export function evaluateExpression(source: string, env: EvalEnv): unknown {
  const pipe = source.lastIndexOf('|');
  const hasFormat = pipe > 0 && !/['"]/.test(source.slice(pipe));
  const expr = (hasFormat ? source.slice(0, pipe) : source).trim();
  let node = cache.get(expr);
  if (!node) {
    node = parseExpression(expr);
    cache.set(expr, node);
  }
  const value = evaluate(node, env);
  if (!hasFormat) return value;
  const pattern = source.slice(pipe + 1).trim();
  if (value instanceof Date) return formatDate(value, pattern);
  const n = toNumber(value);
  if (n !== undefined && /^0(\.0+)?$/.test(pattern))
    return n.toFixed(pattern.split('.')[1]?.length ?? 0);
  return formatDate(FUNCTIONS.date?.([value], env) as Date, pattern);
}

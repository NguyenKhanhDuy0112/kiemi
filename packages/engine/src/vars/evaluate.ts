import { EngineError } from '../errors';
import { AppValue } from './app';
import { addDuration, formatDate, parseDate } from './dates';
import { type Duration, type Node, parseExpression } from './expression';
import { FAKE, GENERATORS, randomInt, randomString } from './generators';

/** Resolves the first segment of a path (`row`, `env`, `maDon`…); `undefined` = unknown. */
export type Lookup = (name: string) => { found: true; value: unknown } | { found: false };

export interface EvalEnv {
  lookup: Lookup;
  now: Date;
}

const isDuration = (v: unknown): v is Duration =>
  typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'duration';

/** Reads `1.000.000`, `1,000.50`, `12,5`, `-3` as numbers [B-05, E-07]. */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v !== 'string') return undefined;
  let s = v.trim().replace(/[\s ]|đ|₫|vnd|vnđ|%|\$/gi, '');
  if (!/^[-+]?[\d.,]+$/.test(s) || !/\d/.test(s)) return undefined;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    // The last separator is the decimal one.
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (dots > 1 || (dots === 1 && /^\D?\d{1,3}\.\d{3}$/.test(s))) {
    s = s.replace(/\./g, ''); // 1.000.000 / 1.000 (VN thousands)
  } else if (commas > 1 || (commas === 1 && /^\D?\d{1,3},\d{3}$/.test(s))) {
    s = s.replace(/,/g, ''); // 1,000,000
  } else if (commas === 1) {
    s = s.replace(',', '.'); // 12,5
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Converts a value to the text typed into the page. */
export function stringify(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (v instanceof AppValue) return v.url();
  if (v instanceof Date) return formatDate(v);
  if (typeof v === 'number') return String(Number(v.toFixed(10)));
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return JSON.stringify(v);
}

function fail(
  code: 'UNKNOWN_VARIABLE' | 'INVALID_EXPRESSION',
  message: string,
  details: Record<string, unknown>,
) {
  return new EngineError(code, message, details);
}

function num(v: unknown, op: string): number {
  const n = toNumber(v);
  if (n === undefined)
    throw fail('INVALID_EXPRESSION', `"${stringify(v)}" is not a number (${op})`, {
      value: stringify(v),
      op,
    });
  return n;
}

const FUNCTIONS: Record<string, (args: unknown[], env: EvalEnv) => unknown> = {
  round: ([x, d]) => {
    const f = 10 ** (d === undefined ? 0 : num(d, 'round'));
    return Math.round(num(x, 'round') * f) / f;
  },
  floor: ([x]) => Math.floor(num(x, 'floor')),
  ceil: ([x]) => Math.ceil(num(x, 'ceil')),
  abs: ([x]) => Math.abs(num(x, 'abs')),
  min: (a) => Math.min(...a.map((x) => num(x, 'min'))),
  max: (a) => Math.max(...a.map((x) => num(x, 'max'))),
  number: ([x]) => num(x, 'number'),
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

export function evaluate(node: Node, env: EvalEnv): unknown {
  switch (node.t) {
    case 'num':
    case 'str':
    case 'dur':
      return node.v;
    case 'neg':
      return -num(evaluate(node.e, env), '-');
    case 'call': {
      const fn = FUNCTIONS[node.name];
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
      let name = node.root;
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
    case 'bin': {
      const l = evaluate(node.l, env);
      const r = evaluate(node.r, env);
      if (node.op === '&') return stringify(l) + stringify(r);
      if (l instanceof Date && isDuration(r) && (node.op === '+' || node.op === '-')) {
        return addDuration(l, r, node.op === '+' ? 1 : -1);
      }
      if (node.op === '+') {
        const a = toNumber(l);
        const b = toNumber(r);
        return a !== undefined && b !== undefined ? a + b : stringify(l) + stringify(r);
      }
      const a = num(l, node.op);
      const b = num(r, node.op);
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

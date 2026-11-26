import { EngineError } from '../errors';

/**
 * Tiny expression language used inside `{{ … }}` [E-01, E-05, E-06, E-07]:
 * numbers, 'strings', variable paths (`row.soNgay`, `resp.body.items[0].id`),
 * function calls, `+ - * / %` (also `× ÷`), `&` (string concat), parentheses,
 * and duration literals for dates (`today + 3d`, `now - 2h`).
 */

export type Unit = 'y' | 'M' | 'w' | 'd' | 'h' | 'min' | 's';
export interface Duration {
  readonly kind: 'duration';
  readonly amount: number;
  readonly unit: Unit;
}

export type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'dur'; v: Duration }
  | { t: 'path'; root: string; parts: (string | Node)[] }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'member'; base: Node; parts: (string | Node)[] }
  | { t: 'neg'; e: Node }
  | { t: 'cmp'; op: '=' | '<>' | '<' | '<=' | '>' | '>='; l: Node; r: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '%' | '&'; l: Node; r: Node };

type Tok =
  | { k: 'num'; v: number }
  | { k: 'dur'; v: Duration }
  | { k: 'str'; v: string }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string };

const UNITS: Record<string, Unit> = {
  y: 'y',
  M: 'M',
  w: 'w',
  d: 'd',
  h: 'h',
  min: 'min',
  m: 'min',
  s: 's',
};

function syntax(source: string, message: string): EngineError {
  return new EngineError('INVALID_EXPRESSION', `Invalid expression "${source}": ${message}`, {
    expression: source,
    reason: message,
  });
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+(?:min|[yMwdhms])?/.exec(src.slice(i)) as RegExpExecArray;
      const text = m[0];
      const unit = /(min|[yMwdhms])$/.exec(text)?.[1];
      // A unit must not be followed by more identifier letters (e.g. `3days`).
      const next = src[i + text.length] ?? '';
      if (unit && !/[A-Za-z_]/.test(next)) {
        out.push({
          k: 'dur',
          v: {
            kind: 'duration',
            amount: Number(text.slice(0, -unit.length)),
            unit: UNITS[unit] as Unit,
          },
        });
      } else {
        const num = /^[0-9]*\.?[0-9]+/.exec(text)?.[0] ?? text;
        out.push({ k: 'num', v: Number(num) });
        i += num.length;
        continue;
      }
      i += text.length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        s += src[j];
        j++;
      }
      if (j >= src.length) throw syntax(src, 'unterminated string');
      out.push({ k: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[\p{L}_$]/u.test(c)) {
      const m = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(src.slice(i)) as RegExpExecArray;
      out.push({ k: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<>' || two === '!=' || two === '<=' || two === '>=' || two === '==') {
      out.push({ k: 'op', v: two === '!=' ? '<>' : two === '==' ? '=' : two });
      i += 2;
      continue;
    }
    if ('+-*/%&().,[]×÷=<>'.includes(c)) {
      out.push({ k: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c });
      i++;
      continue;
    }
    throw syntax(src, `unexpected character "${c}"`);
  }
  return out;
}

/** Parses an expression (without the surrounding braces). */
export function parseExpression(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = toks[p];
    return t?.k === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw syntax(src, `expected "${v}"`);
    p++;
  };

  /** `.name` and `[expr]` after a variable or a call. */
  const accessors = (): (string | Node)[] => {
    const parts: (string | Node)[] = [];
    for (;;) {
      if (isOp('.')) {
        p++;
        const n = peek();
        if (n?.k !== 'id' && n?.k !== 'num') throw syntax(src, 'expected a name after "."');
        p++;
        parts.push(String(n.v));
      } else if (isOp('[')) {
        p++;
        parts.push(comparison());
        expect(']');
      } else break;
    }
    return parts;
  };

  const primary = (): Node => {
    const t = peek();
    if (!t) throw syntax(src, 'unexpected end');
    p++;
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'dur') return { t: 'dur', v: t.v };
    if (t.k === 'str') return { t: 'str', v: t.v };
    if (t.k === 'op' && t.v === '(') {
      const e = comparison();
      expect(')');
      return e;
    }
    if (t.k === 'id') {
      if (isOp('(')) {
        p++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(comparison());
          while (isOp(',')) {
            p++;
            args.push(comparison());
          }
        }
        expect(')');
        const call: Node = { t: 'call', name: t.v, args };
        const after = accessors();
        return after.length ? { t: 'member', base: call, parts: after } : call;
      }
      return { t: 'path', root: t.v, parts: accessors() };
    }
    throw syntax(src, `unexpected "${String((t as Tok).v)}"`);
  };
  const unary = (): Node => {
    if (isOp('-')) {
      p++;
      return { t: 'neg', e: unary() };
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return primary();
  };
  const mult = (): Node => {
    let l = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (toks[p++] as { v: '*' | '/' | '%' }).v;
      l = { t: 'bin', op, l, r: unary() };
    }
    return l;
  };
  function additive(): Node {
    let l = mult();
    while (isOp('+') || isOp('-') || isOp('&')) {
      const op = (toks[p++] as { v: '+' | '-' | '&' }).v;
      l = { t: 'bin', op, l, r: mult() };
    }
    return l;
  }

  function comparison(): Node {
    const l = additive();
    const t = toks[p];
    if (t?.k === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(t.v)) {
      p++;
      return { t: 'cmp', op: t.v as Extract<Node, { t: 'cmp' }>['op'], l, r: additive() };
    }
    return l;
  }

  if (toks.length === 0) throw syntax(src, 'empty expression');
  const node = comparison();
  if (p < toks.length) throw syntax(src, 'unexpected text after the expression');
  return node;
}

/** Readable text of a node, for the step-by-step trace [P-03]. */
export function nodeText(n: Node): string {
  switch (n.t) {
    case 'num':
      return String(n.v);
    case 'str':
      return JSON.stringify(n.v);
    case 'dur':
      return `${n.v.amount}${n.v.unit}`;
    case 'neg':
      return `-${nodeText(n.e)}`;
    case 'cmp':
    case 'bin': {
      // Keep the grouping the tester wrote: `(a - b) * 1.08`, not `a - b * 1.08`.
      const side = (c: Node) => (c.t === 'bin' || c.t === 'cmp' ? `(${nodeText(c)})` : nodeText(c));
      return `${side(n.l)} ${n.op} ${side(n.r)}`;
    }
    case 'call':
      return `${n.name}(${n.args.map(nodeText).join(', ')})`;
    case 'member':
      return n.parts.reduce<string>(
        (acc, p) => (typeof p === 'string' ? `${acc}.${p}` : `${acc}[${nodeText(p)}]`),
        nodeText(n.base),
      );
    case 'path':
      return n.parts.reduce<string>(
        (acc, p) => (typeof p === 'string' ? `${acc}.${p}` : `${acc}[${nodeText(p)}]`),
        n.root,
      );
  }
}

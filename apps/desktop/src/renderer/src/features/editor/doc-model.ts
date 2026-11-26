import type { Step, TestCase } from '@kiemi/schema';

/**
 * Pure helpers to edit a test document (M3-02). Containers (if / loop) keep
 * their inner steps in `params.steps` / `params.elseSteps`.
 */
export const CHILD_KEYS = ['steps', 'elseSteps'] as const;
export type ChildKey = (typeof CHILD_KEYS)[number];

/** Where a list of steps lives: the top level, cleanup, or inside a container step. */
export type ListRef =
  | { kind: 'root' }
  | { kind: 'cleanup' }
  | { kind: 'child'; parentId: string; key: ChildKey };

export interface Row {
  step: Step;
  depth: number;
  /** Shown to testers: `3`, `3.2`, `C1` for cleanup. */
  no: string;
  list: ListRef;
  index: number;
}

const isStepArray = (v: unknown): v is Step[] =>
  Array.isArray(v) &&
  v.every((x) => x !== null && typeof x === 'object' && 'id' in x && 'action' in x);

/** Inner step lists of a container step. */
export function childLists(step: Step): { key: ChildKey; steps: Step[] }[] {
  const out: { key: ChildKey; steps: Step[] }[] = [];
  for (const key of CHILD_KEYS) {
    const v = step.params[key];
    if (isStepArray(v)) out.push({ key, steps: v });
  }
  return out;
}

/** Flat rows for the step table, depth-first. */
export function flatten(doc: TestCase): Row[] {
  const rows: Row[] = [];
  const walk = (steps: Step[], list: ListRef, depth: number, prefix: string) => {
    steps.forEach((step, index) => {
      const no = `${prefix}${index + 1}`;
      rows.push({ step, depth, no, list, index });
      for (const child of childLists(step))
        walk(
          child.steps,
          { kind: 'child', parentId: step.id, key: child.key },
          depth + 1,
          `${no}.`,
        );
    });
  };
  walk(doc.steps, { kind: 'root' }, 0, '');
  walk(doc.cleanup, { kind: 'cleanup' }, 0, 'C');
  return rows;
}

function* allSteps(steps: Step[]): Generator<Step> {
  for (const s of steps) {
    yield s;
    for (const c of childLists(s)) yield* allSteps(c.steps);
  }
}

export function findStep(doc: TestCase, id: string): Step | undefined {
  for (const s of allSteps([...doc.steps, ...doc.cleanup])) if (s.id === id) return s;
  return undefined;
}

/** The mutable array a list ref points at (inside an already-cloned doc). */
function listOf(doc: TestCase, ref: ListRef): Step[] | undefined {
  if (ref.kind === 'root') return doc.steps;
  if (ref.kind === 'cleanup') return doc.cleanup;
  const parent = findStep(doc, ref.parentId);
  if (!parent) return undefined;
  const v = parent.params[ref.key];
  if (isStepArray(v)) return v;
  const created: Step[] = [];
  parent.params[ref.key] = created;
  return created;
}

function locate(doc: TestCase, id: string): { list: Step[]; index: number } | undefined {
  const search = (list: Step[]): { list: Step[]; index: number } | undefined => {
    for (const [index, s] of list.entries()) {
      if (s.id === id) return { list, index };
      for (const c of childLists(s)) {
        const hit = search(c.steps);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return search(doc.steps) ?? search(doc.cleanup);
}

/** Next free `sN` id (unique across the whole document). */
export function newStepId(doc: TestCase): string {
  const used = new Set<string>();
  for (const s of allSteps([...doc.steps, ...doc.cleanup])) used.add(s.id);
  let n = 1;
  while (used.has(`s${n}`)) n++;
  return `s${n}`;
}

const clone = (doc: TestCase): TestCase => structuredClone(doc);

/** Inserts after `afterId` (same list) or at the end of `list` (default: top level). */
export function insertStep(
  doc: TestCase,
  step: Step,
  where: { afterId?: string | null; beforeId?: string | null; list?: ListRef } = {},
): TestCase {
  const next = clone(doc);
  if (where.beforeId) {
    const at = locate(next, where.beforeId);
    if (at) {
      at.list.splice(at.index, 0, step);
      return next;
    }
  }
  if (where.afterId) {
    const at = locate(next, where.afterId);
    if (at) {
      at.list.splice(at.index + 1, 0, step);
      return next;
    }
  }
  const list = listOf(next, where.list ?? { kind: 'root' });
  (list ?? next.steps).push(step);
  return next;
}

export function removeStep(doc: TestCase, id: string): TestCase {
  const next = clone(doc);
  const at = locate(next, id);
  if (at) at.list.splice(at.index, 1);
  return next;
}

/** Copy right below the original, with fresh ids for it and its inner steps (J-04). */
export function duplicateStep(
  doc: TestCase,
  id: string,
): { doc: TestCase; newId: string | undefined } {
  const next = clone(doc);
  const at = locate(next, id);
  if (!at) return { doc, newId: undefined };
  const copy = structuredClone(at.list[at.index] as Step);
  const taken = new Set(allIds(next));
  const assign = (s: Step) => {
    let n = 1;
    while (taken.has(`s${n}`)) n++;
    s.id = `s${n}`;
    taken.add(s.id);
    for (const c of childLists(s)) for (const child of c.steps) assign(child);
  };
  assign(copy);
  at.list.splice(at.index + 1, 0, copy);
  return { doc: next, newId: copy.id };
}

function allIds(doc: TestCase): string[] {
  return [...allSteps([...doc.steps, ...doc.cleanup])].map((s) => s.id);
}

/**
 * Replaces one step via `fn`, copying only the lists on the way to it: every other step
 * keeps its identity, so unchanged rows are not re-rendered (N-05). Undefined if not found.
 */
function mapStepIn(list: Step[], id: string, fn: (s: Step) => Step): Step[] | undefined {
  for (const [i, s] of list.entries()) {
    if (s.id === id) {
      const next = [...list];
      next[i] = fn(s);
      return next;
    }
    for (const child of childLists(s)) {
      const inner = mapStepIn(child.steps, id, fn);
      if (inner) {
        const next = [...list];
        next[i] = { ...s, params: { ...s.params, [child.key]: inner } };
        return next;
      }
    }
  }
  return undefined;
}

/** Changes fields of a step; a field set to `undefined` is removed. */
export function updateStep(
  doc: TestCase,
  id: string,
  patch: { [K in keyof Step]?: Step[K] | undefined },
): TestCase {
  const fn = (step: Step): Step => {
    const s = { ...step } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete s[k];
      else s[k] = structuredClone(v);
    }
    return s as Step;
  };
  const steps = mapStepIn(doc.steps, id, fn);
  if (steps) return { ...doc, steps };
  const cleanup = mapStepIn(doc.cleanup, id, fn);
  if (cleanup) return { ...doc, cleanup };
  return doc;
}

export function toggleStep(doc: TestCase, id: string): TestCase {
  const s = findStep(doc, id);
  return s ? updateStep(doc, id, { enabled: !s.enabled }) : doc;
}

/** Moves a step to `toIndex` inside its own list (drag & drop). */
export function moveStep(doc: TestCase, id: string, toIndex: number): TestCase {
  const next = clone(doc);
  const at = locate(next, id);
  if (!at) return doc;
  const [s] = at.list.splice(at.index, 1);
  at.list.splice(Math.max(0, Math.min(toIndex, at.list.length)), 0, s as Step);
  return next;
}

/** Same list? (drag & drop is allowed only inside one list). */
export function sameList(a: ListRef, b: ListRef): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'child' || (b.kind === 'child' && a.parentId === b.parentId && a.key === b.key);
}

/** How many steps use each session (F-01). */
export function sessionUsage(doc: TestCase): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of allSteps([...doc.steps, ...doc.cleanup]))
    m.set(s.session, (m.get(s.session) ?? 0) + 1);
  return m;
}

/** Step numbers that use element `ref` (J-02 "tìm nơi dùng"). */
export function elementUsages(doc: TestCase, ref: string): string[] {
  const out: string[] = [];
  const uses = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.some(uses);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.ref === ref && Object.keys(o).length === 1) return true;
      return Object.entries(o).some(
        ([k, x]) => !(CHILD_KEYS as readonly string[]).includes(k) && uses(x),
      );
    }
    return false;
  };
  for (const row of flatten(doc)) if (uses(row.step.params)) out.push(row.no);
  return out;
}

/** Variable names saved by steps (`extract.into`, `api.saveTo`) — for `{{` suggestions. */
export function savedVariables(doc: TestCase): string[] {
  const names = new Set<string>();
  for (const s of allSteps([...doc.steps, ...doc.cleanup])) {
    for (const key of ['into', 'saveTo'] as const) {
      const v = s.params[key];
      if (typeof v === 'string' && v) names.add(v);
    }
  }
  return [...names];
}

/** Default param values from a JSON Schema (`default` of each property). */
export function defaultParams(schema: Record<string, unknown>): Record<string, unknown> {
  const props = (schema.properties ?? {}) as Record<string, { default?: unknown }>;
  const out: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(props))
    if (p.default !== undefined) out[k] = structuredClone(p.default);
  return out;
}

type EnvLimit = NonNullable<TestCase['environments']>;
export type EnvMode = 'all' | 'only' | 'except';

/** Pure: the limit after picking a mode / toggling an environment name / editing the reason [O-06]. */
export function nextEnvLimit(
  current: TestCase['environments'],
  change: { mode: EnvMode } | { toggle: string } | { reason: string },
): TestCase['environments'] {
  const mode: EnvMode = current?.only ? 'only' : current?.except ? 'except' : 'all';
  const names = current?.only ?? current?.except ?? [];
  const reason = current?.reason;
  const build = (m: EnvMode, list: string[], why: string | undefined): EnvLimit | undefined => {
    if (m === 'all') return undefined;
    return { [m]: list, ...(why ? { reason: why } : {}) } as EnvLimit;
  };
  if ('mode' in change) return build(change.mode, change.mode === mode ? names : [], reason);
  if ('toggle' in change) {
    const list = names.includes(change.toggle)
      ? names.filter((n) => n !== change.toggle)
      : [...names, change.toggle];
    return build(mode === 'all' ? 'except' : mode, list, reason);
  }
  return current ? { ...current, ...(change.reason ? { reason: change.reason } : {}) } : current;
}

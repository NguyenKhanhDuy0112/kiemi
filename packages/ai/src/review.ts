import type { z } from 'zod';

/** Pulls the JSON out of a model answer (plain, or inside a ``` fence) and checks it [AI-03]. */
export function parseProposal<S extends z.ZodType>(
  text: string,
  schema: S,
): { ok: true; value: z.infer<S> } | { ok: false; error: string } {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.search(/[[{]/);
  const candidate = start > 0 ? raw.slice(start) : raw;
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    return { ok: false, error: 'The answer is not valid JSON' };
  }
  const r = schema.safeParse(json);
  if (!r.success)
    return {
      ok: false,
      error: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
    };
  return { ok: true, value: r.data };
}

export interface Part<T> {
  id: string;
  status: 'added' | 'changed' | 'removed' | 'same';
  before?: T;
  after?: T;
}

/** Compares a list before and after the AI's proposal, one part per item, by `idOf` [AI-03]. */
export function diffParts<T>(before: T[], after: T[], idOf: (x: T) => string): Part<T>[] {
  const b = new Map(before.map((x) => [idOf(x), x]));
  const out: Part<T>[] = [];
  const seen = new Set<string>();
  for (const x of after) {
    const id = idOf(x);
    seen.add(id);
    const old = b.get(id);
    if (old === undefined) out.push({ id, status: 'added', after: x });
    else
      out.push({
        id,
        status: JSON.stringify(old) === JSON.stringify(x) ? 'same' : 'changed',
        before: old,
        after: x,
      });
  }
  for (const [id, x] of b) if (!seen.has(id)) out.push({ id, status: 'removed', before: x });
  return out;
}

/** The list that results when only the accepted parts are applied; the rest stays as before. */
export function applyAccepted<T>(parts: Part<T>[], accepted: ReadonlySet<string>): T[] {
  const out: T[] = [];
  for (const p of parts) {
    const take = accepted.has(p.id);
    if (p.status === 'same') out.push(p.after as T);
    else if (p.status === 'added') {
      if (take) out.push(p.after as T);
    } else if (p.status === 'changed') out.push((take ? p.after : p.before) as T);
    else if (!take) out.push(p.before as T); // removed: kept unless the removal is accepted
  }
  return out;
}

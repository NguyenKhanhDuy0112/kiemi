import { z } from 'zod';

/** A requirement or ticket tests are written for (Jira key, SPEC id…) [T-04]. */
export const RequirementSchema = z.object({
  /** Short key tests point at with the tag `req:<key>`, e.g. `HR-12`. */
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[^\s,]+$/, 'No spaces or commas in a requirement key'),
  title: z.string().trim().max(300).default(''),
  /** Where the ticket lives (tracker link), optional. */
  url: z.string().trim().max(500).optional(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const RequirementsSchema = z
  .array(RequirementSchema)
  .max(2000)
  .superRefine((all, ctx) => {
    const seen = new Set<string>();
    for (const [i, r] of all.entries()) {
      const k = r.key.toLowerCase();
      if (seen.has(k))
        ctx.addIssue({ code: 'custom', message: `Duplicate key "${r.key}"`, path: [i, 'key'] });
      seen.add(k);
    }
  });

/** Tag a tester puts on a test to link it to a requirement: `req:HR-12`. */
export const REQ_PREFIX = 'req:';

export interface ReqTest {
  id: string;
  name: string;
  tags: readonly string[];
  /** Result of the latest run of this test: `passed`, `failed`… or `null` = never run. */
  lastStatus: string | null;
}

export interface RequirementRow {
  requirement: Requirement;
  tests: { id: string; name: string; lastStatus: string | null }[];
  /** `none` = no test; `untested` = tests never run; `passing`; `failing` = a linked test fails. */
  state: 'none' | 'untested' | 'passing' | 'failing';
}

export interface RequirementCoverage {
  rows: RequirementRow[];
  /** Keys tests point at that are not in the list (typos, deleted tickets). */
  unknownKeys: string[];
  /** Requirements with at least one test, in percent (null when there are no requirements). */
  coveredPercent: number | null;
  /** Requirements whose tests all passed, in percent. */
  passingPercent: number | null;
}

const isFail = (s: string | null) => s === 'failed' || s === 'error';

/** Which requirements have tests, and how those tests did [T-04, CV-05]. */
export function requirementCoverage(
  requirements: readonly Requirement[],
  tests: readonly ReqTest[],
): RequirementCoverage {
  const byKey = new Map<string, ReqTest[]>();
  const known = new Set(requirements.map((r) => r.key.toLowerCase()));
  const unknown = new Set<string>();
  for (const t of tests) {
    for (const tag of t.tags) {
      if (!tag.toLowerCase().startsWith(REQ_PREFIX)) continue;
      const key = tag.slice(REQ_PREFIX.length).trim().toLowerCase();
      if (!key) continue;
      if (!known.has(key)) unknown.add(tag.slice(REQ_PREFIX.length).trim());
      byKey.set(key, [...(byKey.get(key) ?? []), t]);
    }
  }
  const rows = requirements.map((requirement): RequirementRow => {
    const linked = byKey.get(requirement.key.toLowerCase()) ?? [];
    const state: RequirementRow['state'] =
      linked.length === 0
        ? 'none'
        : linked.some((t) => isFail(t.lastStatus))
          ? 'failing'
          : linked.every((t) => t.lastStatus === 'passed')
            ? 'passing'
            : 'untested';
    return {
      requirement,
      tests: linked.map((t) => ({ id: t.id, name: t.name, lastStatus: t.lastStatus })),
      state,
    };
  });
  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 100) : null);
  return {
    rows,
    unknownKeys: [...unknown].sort(),
    coveredPercent: pct(rows.filter((r) => r.state !== 'none').length),
    passingPercent: pct(rows.filter((r) => r.state === 'passing').length),
  };
}

/** Lines `KEY | title | url` (or `KEY<TAB>title`) → requirements; blank lines and repeats are skipped. */
export function parseRequirements(text: string): Requirement[] {
  const out: Requirement[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    const [key = '', title = '', url = ''] = line.split(/\s*[|\t]\s*/);
    const k = key.trim();
    if (!k || /\s/.test(k) || k.includes(',') || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push({ key: k, title: title.trim(), ...(url.trim() ? { url: url.trim() } : {}) });
  }
  return out;
}

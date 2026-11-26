import type { CaseTechnique } from './form-cases';

/** Test-design techniques (ISTQB) a test can be labelled with [CV-01]. */
export const TECHNIQUES = [
  'equivalence',
  'boundary',
  'decision-table',
  'state-transition',
  'use-case',
  'pairwise',
  'error-guessing',
  'exploratory',
] as const;
export type Technique = (typeof TECHNIQUES)[number];

/** Quality characteristics (ISO/IEC 25010) a test can be labelled with [CV-01]. */
export const QUALITY_CHARS = [
  'functional',
  'security',
  'usability',
  'reliability',
  'compatibility',
  'performance',
] as const;
export type QualityChar = (typeof QUALITY_CHARS)[number];

const TECH_PREFIX = 'technique:';
const QUALITY_PREFIX = 'quality:';

export const techniqueTag = (t: Technique): string => `${TECH_PREFIX}${t}`;
export const qualityTag = (q: QualityChar): string => `${QUALITY_PREFIX}${q}`;

export interface DesignLabels {
  technique?: Technique;
  quality?: QualityChar;
}

/** The labels in a tag list (first valid one of each kind). */
export function labelsOf(tags: readonly string[]): DesignLabels {
  const technique = tags
    .filter((t) => t.startsWith(TECH_PREFIX))
    .map((t) => t.slice(TECH_PREFIX.length))
    .find((t): t is Technique => (TECHNIQUES as readonly string[]).includes(t));
  const quality = tags
    .filter((t) => t.startsWith(QUALITY_PREFIX))
    .map((t) => t.slice(QUALITY_PREFIX.length))
    .find((q): q is QualityChar => (QUALITY_CHARS as readonly string[]).includes(q));
  return { ...(technique ? { technique } : {}), ...(quality ? { quality } : {}) };
}

/** Replaces the labels in `tags`; `null` removes one, `undefined` keeps it. Other tags stay. */
export function withLabels(
  tags: readonly string[],
  next: { technique?: Technique | null; quality?: QualityChar | null },
): string[] {
  const cur = labelsOf(tags);
  const technique = next.technique === undefined ? cur.technique : (next.technique ?? undefined);
  const quality = next.quality === undefined ? cur.quality : (next.quality ?? undefined);
  const rest = tags.filter((t) => !t.startsWith(TECH_PREFIX) && !t.startsWith(QUALITY_PREFIX));
  return [
    ...rest,
    ...(technique ? [techniqueTag(technique)] : []),
    ...(quality ? [qualityTag(quality)] : []),
  ];
}

const TECHNIQUE_OF_CASE: Record<CaseTechnique, Technique> = {
  valid: 'use-case',
  equivalence: 'equivalence',
  boundary: 'boundary',
  decision: 'decision-table',
  pairwise: 'pairwise',
  badData: 'error-guessing',
};

/** Labels for a case generated from a form spec: bad data that attacks (script, HTML, SQL) is security. */
export function labelsOfCase(technique: CaseTechnique, caseId: string): Required<DesignLabels> {
  const attack = /:bad\.(script-tag|html-tag|sql-injection)$/.test(caseId);
  return {
    technique: TECHNIQUE_OF_CASE[technique],
    quality: attack ? 'security' : 'functional',
  };
}

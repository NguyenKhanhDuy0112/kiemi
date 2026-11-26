import { z } from 'zod';
import {
  labelsOf,
  QUALITY_CHARS,
  type QualityChar,
  TECHNIQUES,
  type Technique,
} from './design-labels';
import { parseFormCaseTag } from './form-matrix';
import type { FormSpec } from './form-spec';

/** Kinds of page, each with its own checklist [CV-02, CV-04]. */
export const PAGE_KINDS = ['form', 'list', 'detail', 'dashboard', 'other'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/** A page of a product the tester says should be tested. */
export const PageDeclSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  /** Address under `{{app}}`, e.g. `/dang-ky`; query and `#` are ignored when matching. */
  path: z.string().trim().min(1).max(500),
  kind: z.enum(PAGE_KINDS).default('other'),
  /** Product key; none = the project's first product. */
  product: z.string().optional(),
});
export type PageDecl = z.infer<typeof PageDeclSchema>;
export const PageDeclsSchema = z.array(PageDeclSchema).max(500);

/** Checklist groups per page kind (short form of docs/QC-COVERAGE.md) [CV-04]. */
export const CHECKLIST: Record<PageKind, readonly string[]> = {
  form: ['validate', 'duplicate', 'roundtrip', 'permission'],
  list: ['search', 'filter', 'sort', 'pagination', 'permission'],
  detail: ['display', 'navigation', 'permission'],
  dashboard: ['numbers', 'permission'],
  other: ['display', 'permission'],
};

/** Tag a tester puts on a test to say it covers a group: `covers:sort`. */
export const COVERS_PREFIX = 'covers:';

/** What coverage needs to know about one test. */
export interface CoverageTest {
  id: string;
  name: string;
  tags: readonly string[];
  /** Addresses opened by the test (`goto` steps), as written. */
  urls: readonly string[];
  /** Product key of the test (null = first product). */
  product: string | null;
}

/** `{{app}}/dang-ky/?x=1#top` → `/dang-ky`. */
export function pathOf(url: string): string {
  const noVars = url
    .replace(/^\{\{\s*app(\.[A-Za-z0-9_]+)?\s*\}\}/, '')
    .replace(/^https?:\/\/[^/]+/i, '');
  const p = (noVars.split(/[?#]/)[0] ?? '').replace(/\/+$/, '');
  return p === '' ? '/' : p.startsWith('/') ? p : `/${p}`;
}

export interface PageCoverage {
  page: PageDecl;
  tests: { id: string; name: string }[];
  /** `true` = covered, in checklist order. */
  groups: { group: string; covered: boolean }[];
}

export interface CountBy<K extends string> {
  key: K;
  count: number;
}

export interface Coverage {
  pages: PageCoverage[];
  untested: PageDecl[];
  byTechnique: CountBy<Technique>[];
  byQuality: CountBy<QualityChar>[];
  /** Tests without any technique label. */
  unlabelled: number;
}

/** Groups a test covers, from its tags and what it is generated from. */
function groupsOf(test: CoverageTest, forms: readonly FormSpec[]): Set<string> {
  const out = new Set<string>();
  for (const t of test.tags)
    if (t.startsWith(COVERS_PREFIX)) out.add(t.slice(COVERS_PREFIX.length));
  const fc = parseFormCaseTag(test.tags);
  if (fc) {
    const form = forms.find((f) => f.id === fc.formId);
    if (!fc.caseId.includes(':unique')) out.add('validate');
    if (fc.caseId.endsWith(':unique')) out.add('duplicate');
    if (form?.fields.some((f) => f.readBack) && fc.caseId === 'valid') out.add('roundtrip');
  }
  return out;
}

/** Page and checklist coverage plus counts by technique / quality [CV-01, CV-02, CV-04]. */
export function computeCoverage(
  pages: readonly PageDecl[],
  tests: readonly CoverageTest[],
  forms: readonly FormSpec[],
  firstProduct: string,
): Coverage {
  const rows: PageCoverage[] = pages.map((page) => {
    const product = page.product ?? firstProduct;
    const target = pathOf(page.path);
    const mine = tests.filter(
      (t) => (t.product ?? firstProduct) === product && t.urls.some((u) => pathOf(u) === target),
    );
    const covered = new Set<string>();
    for (const t of mine) for (const g of groupsOf(t, forms)) covered.add(g);
    return {
      page,
      tests: mine.map((t) => ({ id: t.id, name: t.name })),
      groups: CHECKLIST[page.kind].map((group) => ({ group, covered: covered.has(group) })),
    };
  });
  const tech = new Map<Technique, number>();
  const qual = new Map<QualityChar, number>();
  let unlabelled = 0;
  for (const t of tests) {
    const l = labelsOf(t.tags);
    if (l.technique) tech.set(l.technique, (tech.get(l.technique) ?? 0) + 1);
    else unlabelled++;
    if (l.quality) qual.set(l.quality, (qual.get(l.quality) ?? 0) + 1);
  }
  return {
    pages: rows,
    untested: rows.filter((r) => r.tests.length === 0).map((r) => r.page),
    byTechnique: TECHNIQUES.map((key) => ({ key, count: tech.get(key) ?? 0 })),
    byQuality: QUALITY_CHARS.map((key) => ({ key, count: qual.get(key) ?? 0 })),
    unlabelled,
  };
}

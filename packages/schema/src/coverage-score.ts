import { CHECKLIST, type Coverage } from './coverage';

export interface CoverageScore {
  /** Declared pages with at least one test, in percent (null = no pages declared). */
  pages: number | null;
  /** Checklist groups covered over all declared pages, in percent. */
  checklist: number | null;
  /** Tests that carry a technique label, in percent. */
  labels: number | null;
  /** Average of the parts that have data (null = nothing to score). */
  total: number | null;
}

const pct = (n: number, of: number) => (of === 0 ? null : Math.round((n / of) * 100));

/** One number for the dashboard: page + checklist + label coverage [CV-09, CV-01, CV-02, CV-04]. */
export function coverageScore(cov: Coverage, totalTests: number): CoverageScore {
  const pages = pct(cov.pages.filter((p) => p.tests.length > 0).length, cov.pages.length);
  const groups = cov.pages.flatMap((p) => p.groups);
  const checklist = pct(groups.filter((g) => g.covered).length, groups.length);
  const labels = pct(totalTests - cov.unlabelled, totalTests);
  const parts = [pages, checklist, labels].filter((x): x is number => x !== null);
  const total = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  return { pages, checklist, labels, total };
}

/** Same checklist size the page kinds define (exposed for tests). */
export const CHECKLIST_SIZES = Object.fromEntries(
  Object.entries(CHECKLIST).map(([k, v]) => [k, v.length]),
);

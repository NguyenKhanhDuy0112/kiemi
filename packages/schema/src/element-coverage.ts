import type { LocatorStrategy } from './locator';

/** The parts of a scanned element the matching needs [CV-03]. */
export interface ElementFacts {
  role: string;
  name: string;
  id: string;
  testId: string;
  placeholder: string;
}

const same = (a: string, b: string | undefined) =>
  b !== undefined && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Does a locator strategy used by a test point at this element? */
export function strategyHits(el: ElementFacts, s: LocatorStrategy): boolean {
  switch (s.kind) {
    case 'role':
      return same(el.role, s.role) && (s.name === undefined || same(el.name, s.name));
    case 'label':
      return el.name !== '' && same(el.name, s.value);
    case 'text':
      return (
        el.name !== '' &&
        (s.exact ? same(el.name, s.value) : el.name.toLowerCase().includes(s.value.toLowerCase()))
      );
    case 'placeholder':
      return el.placeholder !== '' && same(el.placeholder, s.value);
    case 'testId':
      return el.testId !== '' && same(el.testId, s.value);
    case 'css': {
      const v = s.value.trim();
      if (
        el.id &&
        (v === `#${el.id}` || new RegExp(`(^|[\\s>])#${el.id.replace(/[^\w-]/g, '\\$&')}$`).test(v))
      )
        return true;
      return el.testId !== '' && v.includes(`data-testid="${el.testId}"`);
    }
    default:
      return false;
  }
}

export interface CoveredElement<E extends ElementFacts> {
  element: E;
  covered: boolean;
}

/**
 * Marks which elements of a page a test has ever acted on or checked: any
 * locator of any test that points at the element counts [CV-03].
 */
export function elementCoverage<E extends ElementFacts>(
  elements: readonly E[],
  used: readonly (readonly LocatorStrategy[])[],
): { items: CoveredElement<E>[]; coveredPercent: number | null } {
  const items = elements.map((element) => ({
    element,
    covered: used.some((set) => set.some((s) => strategyHits(element, s))),
  }));
  return {
    items,
    coveredPercent: items.length
      ? Math.round((items.filter((i) => i.covered).length / items.length) * 100)
      : null,
  };
}

/** Every locator strategy list used by the steps of a test (inline or by element reference), nested steps included. */
export function usedStrategies(content: {
  steps: unknown;
  cleanup?: unknown;
  elements?: Record<string, { strategies: LocatorStrategy[] }>;
}): LocatorStrategy[][] {
  const out: LocatorStrategy[][] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.strategies)) out.push(o.strategies as LocatorStrategy[]);
    if (typeof o.ref === 'string' && content.elements?.[o.ref])
      out.push(content.elements[o.ref]?.strategies ?? []);
    for (const k of Object.keys(o)) if (typeof o[k] === 'object') walk(o[k]);
  };
  walk(content.steps);
  walk(content.cleanup);
  return out;
}

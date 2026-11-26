import type { Fingerprint, Locator } from '@kiemi/schema';
import type { Frame, Page } from 'playwright-core';

/** An element on the page that looks like the one a step lost [FX-06]. */
export interface SimilarCandidate {
  /** Locator that pins this element. */
  locator: Locator;
  /** What the tester sees: tag and text. */
  label: string;
  /** Higher = more alike. */
  score: number;
}

const MIN_SCORE = 2;
const MAX_CANDIDATES = 3;
const KEY_ATTRIBUTES = [
  'name',
  'type',
  'placeholder',
  'aria-label',
  'data-testid',
  'title',
  'role',
  'href',
  'value',
];

interface Found {
  selector: string;
  label: string;
  score: number;
  testId?: string;
  text: string;
}

/** Runs inside the page: scores every visible element of the same tag. */
function scan({ fp, keys }: { fp: Fingerprint; keys: string[] }): Found[] {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const tokens = (s: string) =>
    new Set(
      norm(s)
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean),
    );
  const wantText = norm(fp.text ?? '');
  const wantTokens = tokens(fp.text ?? '');
  const wantClass = new Set((fp.attributes.class ?? '').split(/\s+/).filter(Boolean));
  const cssPath = (el: Element): string => {
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1)
      return `#${CSS.escape(el.id)}`;
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.body && parts.length < 5) {
      const parent: Element | null = cur.parentElement;
      const tag = cur.tagName.toLowerCase();
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const same = [...parent.children].filter((c) => c.tagName === cur?.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
      if (cur.id) {
        parts[0] = `#${CSS.escape(cur.id)}`;
        break;
      }
      cur = parent;
    }
    return parts.join(' > ');
  };
  const out: Found[] = [];
  for (const el of document.querySelectorAll(fp.tag)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    let score = 0;
    const raw = ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const text = norm(raw);
    if (wantText) {
      if (text === wantText) score += 3;
      else if (text && (text.includes(wantText) || wantText.includes(text))) score += 2;
      else {
        const have = tokens(text);
        const shared = [...wantTokens].filter((t) => have.has(t)).length;
        if (shared) score += (2 * shared) / Math.max(wantTokens.size, have.size);
      }
    }
    if (fp.attributes.id && el.id === fp.attributes.id) score += 2;
    for (const k of keys) {
      const want = fp.attributes[k];
      if (want && el.getAttribute(k) === want) score += 1;
    }
    if (wantClass.size) {
      const have = new Set([...el.classList]);
      const shared = [...wantClass].filter((c) => have.has(c)).length;
      score += shared / wantClass.size;
    }
    if (fp.box) {
      const d = Math.hypot(r.x + window.scrollX - fp.box.x, r.y + window.scrollY - fp.box.y);
      if (d < 300) score += 1 - d / 300;
    }
    if (score <= 0) continue;
    const testId = el.getAttribute('data-testid') ?? undefined;
    out.push({
      selector: cssPath(el),
      label: `<${fp.tag}> ${raw.slice(0, 40)}`.trim(),
      score,
      text: raw.slice(0, 60),
      ...(testId ? { testId } : {}),
    });
  }
  return out;
}

/**
 * Finds elements that look like the one `locator` described when it was recorded,
 * using its fingerprint (tag, text, attributes, position) [C-02, FX-06].
 */
export async function findSimilar(page: Page, locator: Locator): Promise<SimilarCandidate[]> {
  const fp = locator.fingerprint;
  if (!fp) return [];
  const frames: Frame[] = [
    page.mainFrame(),
    ...page.frames().filter((f) => f !== page.mainFrame()),
  ];
  const found: Found[] = [];
  for (const f of frames) {
    found.push(...(await f.evaluate(scan, { fp, keys: KEY_ATTRIBUTES }).catch(() => [])));
  }
  return found
    .filter((c) => c.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({
      label: c.label,
      score: Math.round(c.score * 10) / 10,
      locator: {
        strategies: [
          ...(c.testId ? [{ kind: 'testId' as const, value: c.testId }] : []),
          { kind: 'css' as const, value: c.selector },
        ],
        fingerprint: { ...fp, ...(c.text ? { text: c.text } : {}) },
      },
    }));
}

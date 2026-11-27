import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';

/** Fails with every problem found, one per line, so the tester fixes them all at once. */
function report(stepNo: string, check: string, problems: string[]): void {
  if (problems.length === 0) return;
  throw new EngineError(
    'ASSERTION_FAILED',
    `Step ${stepNo}: ${check}: ${problems.length} problem(s) — ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? '; …' : ''}`,
    { check, op: 'audit', expected: 'no problems', actual: problems.join('\n'), problems },
  );
}

/** SEO / meta of the page: title, description, og:*, canonical, one h1, images with alt [Y-06]. */
export const assertSeoAction = defineAction({
  type: 'assertSeo',
  params: z.object({
    title: z.boolean().default(true),
    description: z.boolean().default(true),
    openGraph: z.boolean().default(true),
    canonical: z.boolean().default(true),
    singleH1: z.boolean().default(true),
    imageAlt: z.boolean().default(true),
    maxTitle: z.coerce.number().int().positive().default(70),
    maxDescription: z.coerce.number().int().positive().default(170),
  }),
  ui: { label: 'actions.assertSeo', icon: 'search-check', group: 'assert' },
  async execute(p, ctx) {
    const page = await ctx.page();
    const d = await page.evaluate(() => {
      const meta = (sel: string) =>
        document.querySelector<HTMLMetaElement>(sel)?.content?.trim() ?? '';
      return {
        title: document.title.trim(),
        description: meta('meta[name="description"]'),
        og: ['og:title', 'og:description', 'og:image'].filter(
          (k) => !meta(`meta[property="${k}"]`),
        ),
        canonical:
          document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href?.trim() ?? '',
        h1: document.querySelectorAll('h1').length,
        noAlt: [...document.querySelectorAll('img')]
          .filter((i) => !i.hasAttribute('alt'))
          .map((i) => i.getAttribute('src')?.slice(0, 40) ?? 'img'),
      };
    });
    const out: string[] = [];
    if (p.title) {
      if (!d.title) out.push('missing <title>');
      else if (d.title.length > p.maxTitle) out.push(`title longer than ${p.maxTitle} characters`);
    }
    if (p.description) {
      if (!d.description) out.push('missing meta description');
      else if (d.description.length > p.maxDescription)
        out.push(`description longer than ${p.maxDescription} characters`);
    }
    if (p.openGraph && d.og.length) out.push(`missing ${d.og.join(', ')}`);
    if (p.canonical && !d.canonical) out.push('missing canonical link');
    if (p.singleH1 && d.h1 !== 1) out.push(`${d.h1} <h1> found, expected exactly 1`);
    if (p.imageAlt && d.noAlt.length) out.push(`${d.noAlt.length} image(s) without alt`);
    report(ctx.stepNo, 'seo', out);
  },
});

/** Text that looks like a missing translation or a leaked template, plus number/date formats of the locale [Y-07]. */
export const assertI18nAction = defineAction({
  type: 'assertI18n',
  params: z.object({
    locale: z.enum(['vi', 'en']).default('vi'),
    /** Extra words that must not appear (e.g. English words on the Vietnamese page). */
    forbidden: z.array(z.string().min(1)).default([]),
    formats: z.boolean().default(true),
  }),
  ui: { label: 'actions.assertI18n', icon: 'languages', group: 'assert' },
  async execute({ locale, forbidden, formats }, ctx) {
    const page = await ctx.page();
    const text = await page.evaluate(() => document.body.innerText);
    const out: string[] = [];
    const find = (re: RegExp, what: string) => {
      const m = text.match(re);
      if (m) out.push(`${what}: "${m[0]}"`);
    };
    find(/\{\{[^}]*\}\}|\{%[^%]*%\}/, 'unfilled template');
    find(/\bundefined\b|\bNaN\b|\[object Object\]/, 'leaked value');
    find(/\b[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*){2,}\b/, 'untranslated key');
    for (const w of forbidden) {
      const re = new RegExp(
        `(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`,
        'iu',
      );
      if (re.test(text)) out.push(`unexpected text "${w}"`);
    }
    if (formats) {
      if (locale === 'vi') {
        find(/\b\d{4}-\d{2}-\d{2}\b/, 'date not in dd/MM/yyyy');
        find(/(?<![\d.,])\d{1,3}(,\d{3})+(?![\d,])/, 'English thousands separator');
      } else {
        find(/(?<![\d.,])\d{1,3}(\.\d{3})+(?![\d.])(?!,)/, 'Vietnamese thousands separator');
      }
    }
    report(ctx.stepNo, 'i18n', out);
  },
});

/** Layout at several widths: horizontal overflow, overlapping text, text cut off [Y-09]. */
export const assertLayoutAction = defineAction({
  type: 'assertLayout',
  params: z.object({
    widths: z.array(z.coerce.number().int().min(240).max(4000)).min(1).default([375, 768, 1280]),
    overflow: z.boolean().default(true),
    overlap: z.boolean().default(true),
    clipped: z.boolean().default(true),
  }),
  ui: { label: 'actions.assertLayout', icon: 'layout-template', group: 'assert' },
  async execute({ widths, overflow, overlap, clipped }, ctx) {
    const page = await ctx.page();
    const before = page.viewportSize();
    const out: string[] = [];
    try {
      for (const width of widths) {
        await page.setViewportSize({ width, height: before?.height ?? 800 });
        const found = await page.evaluate(
          ({ overflow, overlap, clipped }) => {
            const res: string[] = [];
            const de = document.documentElement;
            if (overflow && de.scrollWidth > de.clientWidth + 1)
              res.push(`horizontal scroll (${de.scrollWidth}px > ${de.clientWidth}px)`);
            const label = (el: Element) =>
              `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${(el.textContent ?? '').trim().slice(0, 24)}"`;
            const leaves = [...document.body.querySelectorAll('*')].filter((el) => {
              const s = getComputedStyle(el);
              if (s.visibility === 'hidden' || s.display === 'none') return false;
              return (
                el.children.length === 0 &&
                (el.textContent ?? '').trim() !== '' &&
                el.getClientRects().length > 0
              );
            });
            if (clipped) {
              for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
                const s = getComputedStyle(el);
                if (!(s.overflowX === 'hidden' || s.overflowY === 'hidden')) continue;
                if (s.textOverflow === 'ellipsis') continue;
                if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
                  res.push(`text cut off in ${label(el)}`);
              }
            }
            if (overlap) {
              const boxes = leaves.map((el) => ({ el, r: el.getBoundingClientRect() }));
              for (let i = 0; i < boxes.length; i++) {
                for (let j = i + 1; j < boxes.length; j++) {
                  const a = boxes[i]?.r;
                  const b = boxes[j]?.r;
                  if (!a || !b) continue;
                  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                  if (
                    w > 2 &&
                    h > 2 &&
                    (boxes[i]?.el.contains(boxes[j]?.el as Node) ?? false) === false
                  )
                    res.push(
                      `${label(boxes[i]?.el as Element)} overlaps ${label(boxes[j]?.el as Element)}`,
                    );
                }
              }
            }
            return res;
          },
          { overflow, overlap, clipped },
        );
        for (const f of found) out.push(`${width}px: ${f}`);
      }
    } finally {
      if (before) await page.setViewportSize(before).catch(() => undefined);
    }
    report(ctx.stepNo, 'layout', out);
  },
});

import type { Page } from 'playwright-core';

export type InteractiveKind = 'button' | 'link' | 'field' | 'menu';

/** One thing a user can click or type in, as seen on the page [CV-03]. */
export interface ScannedElement {
  kind: InteractiveKind;
  tag: string;
  /** ARIA role (given or implied). */
  role: string;
  /** Visible text / label / placeholder the user would call it by. */
  name: string;
  id: string;
  testId: string;
  placeholder: string;
  /** Box in CSS pixels, relative to the screenshot. */
  rect: { x: number; y: number; width: number; height: number };
}

export interface InteractiveScan {
  elements: ScannedElement[];
  /** PNG of the viewport, base64. */
  screenshot: string;
  width: number;
  height: number;
}

/** Lists the visible interactive elements of the page with their boxes, plus a screenshot [CV-03]. */
export async function scanInteractive(page: Page): Promise<InteractiveScan> {
  const elements = await page.evaluate(() => {
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const IMPLIED: Record<string, string> = {
      a: 'link',
      button: 'button',
      select: 'combobox',
      textarea: 'textbox',
    };
    const out: {
      kind: 'button' | 'link' | 'field' | 'menu';
      tag: string;
      role: string;
      name: string;
      id: string;
      testId: string;
      placeholder: string;
      rect: { x: number; y: number; width: number; height: number };
    }[] = [];
    const sel =
      'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=menuitem], [role=tab], [role=checkbox], [role=radio], [role=switch]';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || st.visibility === 'hidden' || st.display === 'none')
        continue;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
      const tag = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type ?? '';
      const role =
        el.getAttribute('role') ??
        (tag === 'input'
          ? type === 'checkbox'
            ? 'checkbox'
            : type === 'radio'
              ? 'radio'
              : ['button', 'submit', 'reset'].includes(type)
                ? 'button'
                : 'textbox'
          : (IMPLIED[tag] ?? ''));
      const label = (el as HTMLInputElement).labels?.[0]?.textContent;
      const name = clean(
        el.getAttribute('aria-label') ||
          label ||
          (tag === 'input' && ['button', 'submit', 'reset'].includes(type)
            ? (el as HTMLInputElement).value
            : el.innerText || el.textContent) ||
          el.getAttribute('placeholder') ||
          el.getAttribute('title'),
      );
      const kind =
        role === 'menuitem' || role === 'tab'
          ? 'menu'
          : role === 'link'
            ? 'link'
            : role === 'button'
              ? 'button'
              : 'field';
      out.push({
        kind,
        tag,
        role,
        name: name.slice(0, 80),
        id: el.id,
        testId: el.getAttribute('data-testid') ?? '',
        placeholder: el.getAttribute('placeholder') ?? '',
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      });
    }
    return out;
  });
  const size = page.viewportSize() ?? { width: 1280, height: 720 };
  const shot = await page.screenshot({ type: 'png' });
  return { elements, screenshot: shot.toString('base64'), width: size.width, height: size.height };
}

import type { Page } from 'playwright-core';
import { type ScannedForm, scanForms } from './scan';

/** What the assistant may know about the page open in the browser [AI-17]. */
export interface PageContext {
  url: string;
  title: string;
  /** Accessibility tree as text (roles and names), cut to `MAX_ARIA`. */
  aria: string;
  forms: ScannedForm[];
}

const MAX_ARIA = 12_000;

/** `- textbox "Email": typed text` → drop what was typed; keep the role and name. */
const stripTyped = (aria: string): string =>
  aria.replace(
    /^(\s*- (?:textbox|searchbox|combobox|spinbutton)\b[^\n]*?"(?:[^"\\]|\\.)*"[^\n:]*):[^\n]*$/gm,
    '$1',
  );

/** Reads the page for the assistant. Field values are dropped: they may hold personal data. */
export async function capturePageContext(page: Page): Promise<PageContext> {
  const raw = await page
    .locator('body')
    .ariaSnapshot()
    .catch(() => '');
  const aria = stripTyped(raw);
  const forms = await scanForms(page).catch(() => [] as ScannedForm[]);
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    aria: aria.length > MAX_ARIA ? `${aria.slice(0, MAX_ARIA)}\n…(cut)` : aria,
    forms: forms.map((f) => ({ ...f, controls: f.controls.map((c) => ({ ...c, value: '' })) })),
  };
}

/** The context as text for a prompt. Goes through the gateway, which hides secrets and PII. */
export function pageContextText(c: PageContext): string {
  const forms = c.forms
    .map((f) => {
      const fields = f.controls
        .map((x) => {
          const rules = [
            x.required ? 'required' : '',
            x.minLength !== null ? `minLength=${x.minLength}` : '',
            x.maxLength !== null ? `maxLength=${x.maxLength}` : '',
            x.min !== null ? `min=${x.min}` : '',
            x.max !== null ? `max=${x.max}` : '',
            x.pattern ? `pattern=${x.pattern}` : '',
            x.options.length ? `options=${x.options.join('|')}` : '',
          ].filter(Boolean);
          return `  - ${x.label || x.name || x.id} [${x.type}] ${rules.join(' ')} (css: ${x.css})`;
        })
        .join('\n');
      return `Form "${f.name}"${f.submit ? ` submit="${f.submit.text}"` : ''}:\n${fields}`;
    })
    .join('\n');
  return `Page: ${c.title} (${c.url})\nAccessibility tree:\n${c.aria}\n${forms}`.trim();
}

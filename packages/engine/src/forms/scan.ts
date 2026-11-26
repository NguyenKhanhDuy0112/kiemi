import type { Page } from 'playwright-core';

/** One input of a page form as the browser describes it (before any interpretation). */
export interface ScannedControl {
  tag: 'input' | 'select' | 'textarea';
  /** `<input type>` ("text" when absent); `select`/`textarea` repeat the tag. */
  type: string;
  id: string;
  name: string;
  /** Text of the associated label with the trailing `*` removed. */
  label: string;
  /** The label (or the field) carries a `*` / `aria-required`. */
  labelStar: boolean;
  placeholder: string;
  required: boolean;
  readOnly: boolean;
  minLength: number | null;
  maxLength: number | null;
  min: string | null;
  max: string | null;
  pattern: string | null;
  accept: string | null;
  value: string;
  /** Choices of a select, or the values of a radio group. */
  options: string[];
  /** CSS selector that finds this input again. */
  css: string;
}

export interface ScannedForm {
  /** `id` / `name` of the `<form>`, "" for loose inputs outside any form. */
  name: string;
  controls: ScannedControl[];
}

/**
 * Reads every form of the current page: inputs with their label and HTML
 * validation attributes [R-02]. Radios with the same name become one control.
 */
export async function scanForms(page: Page): Promise<ScannedForm[]> {
  return page.evaluate(() => {
    const SKIP = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const esc = (s: string) => CSS.escape(s);

    const labelOf = (el: HTMLElement): string => {
      const own = el as HTMLInputElement;
      const parts: string[] = [];
      if (own.labels?.length)
        for (const l of Array.from(own.labels)) parts.push(l.textContent ?? '');
      if (!parts.length) {
        const ids = el.getAttribute('aria-labelledby');
        if (ids)
          for (const id of ids.split(/\s+/))
            parts.push(document.getElementById(id)?.textContent ?? '');
      }
      if (!parts.length) parts.push(el.getAttribute('aria-label') ?? '');
      return clean(parts.join(' '));
    };

    const cssOf = (el: HTMLElement): string => {
      if (el.id) return `#${esc(el.id)}`;
      const name = el.getAttribute('name');
      return name
        ? `${el.tagName.toLowerCase()}[name="${name.replace(/"/g, '\\"')}"]`
        : el.tagName.toLowerCase();
    };

    const describe = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
      const tag = el.tagName.toLowerCase() as 'input' | 'select' | 'textarea';
      const input = el as HTMLInputElement;
      const rawLabel = labelOf(el);
      const star = /\*\s*$/.test(rawLabel) || /^\s*\*/.test(rawLabel);
      const num = (v: number) => (v >= 0 ? v : null);
      const ml = (a: string) => (el.hasAttribute(a) ? num(Number(el.getAttribute(a))) : null);
      return {
        tag,
        type: tag === 'input' ? (input.getAttribute('type') ?? 'text').toLowerCase() : tag,
        id: el.id,
        name: el.getAttribute('name') ?? '',
        label: clean(rawLabel.replace(/\*/g, '')),
        labelStar: star || el.getAttribute('aria-required') === 'true',
        placeholder: el.getAttribute('placeholder') ?? '',
        required: el.hasAttribute('required'),
        readOnly: el.hasAttribute('readonly'),
        minLength: ml('minlength'),
        maxLength: ml('maxlength'),
        min: el.getAttribute('min'),
        max: el.getAttribute('max'),
        pattern: el.getAttribute('pattern'),
        accept: el.getAttribute('accept'),
        value: tag === 'select' ? '' : (input.value ?? ''),
        options:
          tag === 'select'
            ? Array.from((el as HTMLSelectElement).options)
                .filter((o) => o.value !== '' && !o.disabled)
                .map((o) => clean(o.textContent) || o.value)
            : [],
        css: cssOf(el),
      };
    };

    const collect = (root: ParentNode) => {
      const out: ReturnType<typeof describe>[] = [];
      const radios = new Map<string, ReturnType<typeof describe>>();
      for (const el of Array.from(
        root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input, select, textarea',
        ),
      )) {
        const type =
          el.tagName === 'INPUT' ? (el.getAttribute('type') ?? 'text').toLowerCase() : '';
        if (SKIP.has(type) || el.disabled) continue;
        if (type === 'radio') {
          const name = el.getAttribute('name') ?? el.id;
          const value = (el as HTMLInputElement).value;
          const group = radios.get(name);
          if (group) {
            group.options.push(value);
            group.required ||= el.hasAttribute('required');
            continue;
          }
          const d = describe(el);
          d.options = [value];
          // A radio's own label is its option text; the group label is the legend.
          d.label = clean(el.closest('fieldset')?.querySelector('legend')?.textContent ?? d.name);
          radios.set(name, d);
          out.push(d);
          continue;
        }
        out.push(describe(el));
      }
      return out;
    };

    const forms = Array.from(document.forms).map((f) => ({
      name: f.id || f.getAttribute('name') || '',
      controls: collect(f),
    }));
    const loose = collect(document).filter((c) => !document.querySelector(c.css)?.closest('form'));
    return loose.length ? [...forms, { name: '', controls: loose }] : forms;
  });
}

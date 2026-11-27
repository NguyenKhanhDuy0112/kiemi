import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { left, target, text } from './_common';

/**
 * Removes the browser-side rules of the form around the page (required,
 * maxlength, pattern, min/max, special input types) so invalid data can be sent
 * and the SERVER's own validation is what gets tested [R-06].
 */
export const stripClientValidationAction = defineAction({
  type: 'stripClientValidation',
  params: z.object({ form: z.string().min(1).optional() }),
  ui: { label: 'actions.stripClientValidation', icon: 'shield-off', group: 'input' },
  async execute({ form }, ctx) {
    const page = await ctx.page();
    const n = await page.evaluate((sel) => {
      const root: ParentNode = sel ? (document.querySelector(sel) ?? document) : document;
      let count = 0;
      for (const f of root.querySelectorAll('form')) f.setAttribute('novalidate', '');
      for (const el of root.querySelectorAll<HTMLElement>('input, textarea, select')) {
        for (const a of ['required', 'maxlength', 'minlength', 'pattern', 'min', 'max', 'step']) {
          if (el.hasAttribute(a)) {
            el.removeAttribute(a);
            count++;
          }
        }
        if (el instanceof HTMLInputElement && ['email', 'number', 'url', 'tel'].includes(el.type))
          el.type = 'text';
      }
      return count;
    }, form ?? null);
    ctx.log(`Removed ${n} browser rule(s)`);
  },
});

/** Label, placeholder, default value, required mark, read-only / disabled state of one field [R-08]. */
export const assertFieldUiAction = defineAction({
  type: 'assertFieldUi',
  params: z.object({
    target,
    label: text.optional(),
    placeholder: text.optional(),
    defaultValue: text.optional(),
    /** The label shows `*` or the field is `required`. */
    required: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    disabled: z.boolean().optional(),
    maxLength: z.coerce.number().int().optional(),
  }),
  ui: { label: 'actions.assertFieldUi', icon: 'text-cursor-input', group: 'assert' },
  async execute(p, ctx) {
    const { locator } = await ctx.resolve(p.target, { state: 'attached' });
    const got = await locator.evaluate((el) => {
      const h = el as HTMLInputElement;
      const label =
        h.labels?.[0]?.textContent?.trim() ?? h.getAttribute('aria-label')?.trim() ?? '';
      return {
        label,
        placeholder: h.placeholder ?? '',
        value: h.value ?? '',
        required:
          h.required === true || h.getAttribute('aria-required') === 'true' || label.includes('*'),
        readOnly: h.readOnly === true,
        disabled: h.disabled === true,
        maxLength: h.maxLength >= 0 ? h.maxLength : -1,
      };
    });
    const out: string[] = [];
    const eq = (what: string, want: unknown, have: unknown) => {
      if (want !== undefined && String(want) !== String(have))
        out.push(`${what}: expected "${want}" but found "${have}"`);
    };
    if (p.label !== undefined && !got.label.replace(/\s*\*\s*$/, '').includes(p.label))
      out.push(`label: expected "${p.label}" but found "${got.label}"`);
    eq('placeholder', p.placeholder, got.placeholder);
    eq('default value', p.defaultValue, got.value);
    eq('required', p.required, got.required);
    eq('read-only', p.readOnly, got.readOnly);
    eq('disabled', p.disabled, got.disabled);
    eq('max length', p.maxLength, got.maxLength);
    if (out.length) {
      throw new EngineError('ASSERTION_FAILED', `Step ${ctx.stepNo}: field UI: ${out.join('; ')}`, {
        check: 'fieldUi',
        op: 'audit',
        expected: 'as designed',
        actual: out.join('\n'),
        problems: out,
      });
    }
  },
});

/** Pressing Tab moves through the fields in this order [R-08]. */
export const assertTabOrderAction = defineAction({
  type: 'assertTabOrder',
  params: z.object({ fields: z.array(target).min(2).max(50) }),
  ui: { label: 'actions.assertTabOrder', icon: 'arrow-right-to-line', group: 'assert' },
  async execute({ fields }, ctx) {
    const page = await ctx.page();
    const first = await ctx.resolve(fields[0] as (typeof fields)[number]);
    await first.locator.focus({ timeout: left(ctx) });
    for (const [i, f] of fields.slice(1).entries()) {
      await page.keyboard.press('Tab');
      const { locator } = await ctx.resolve(f, { state: 'attached' });
      const focused = await locator.evaluate((el) => el === document.activeElement);
      if (!focused) {
        const now = await page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          return a ? `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''}` : 'nothing';
        });
        throw new EngineError(
          'ASSERTION_FAILED',
          `Step ${ctx.stepNo}: after Tab ${i + 1} focus is on ${now}, not on field ${i + 2} of the list`,
          { check: 'tabOrder', op: 'order', expected: `field ${i + 2}`, actual: now },
        );
      }
    }
  },
});

/** The page asks before being left with unsaved data (or does not) [R-13]. */
export const assertLeaveWarningAction = defineAction({
  type: 'assertLeaveWarning',
  params: z.object({ expected: z.boolean().default(true) }),
  ui: { label: 'actions.assertLeaveWarning', icon: 'door-open', group: 'assert' },
  async execute({ expected }, ctx) {
    const page = await ctx.page();
    const warns = await page.evaluate(() => {
      const ev = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented || (ev as BeforeUnloadEvent).returnValue === false;
    });
    if (warns !== expected) {
      throw new EngineError(
        'ASSERTION_FAILED',
        `Step ${ctx.stepNo}: leaving the page ${warns ? 'warns' : 'does not warn'} but it ${expected ? 'should' : 'should not'}`,
        {
          check: 'leaveWarning',
          op: expected ? 'warns' : 'silent',
          expected: expected ? 'warns' : 'silent',
          actual: warns ? 'warns' : 'silent',
        },
      );
    }
  },
});

import { expectedMessage, type MessageCatalog } from './field-rules';
import type { FormCase } from './form-cases';
import type { FieldSpec, FormSpec } from './form-spec';
import type { Locator } from './locator';
import type { StepInput } from './step';

/** Where a field is when it has no stored locator: by its visible label. */
const locatorOf = (f: FieldSpec): Locator =>
  f.locator ?? { strategies: [{ kind: 'label', value: f.label }] };

/** Text the form is expected to show for the broken field of a reject case. */
export function expectedError(
  form: FormSpec,
  c: FormCase,
  catalog: MessageCatalog = {},
): string | undefined {
  if (c.expect !== 'reject' || !c.messageKey) return undefined;
  const f = form.fields.find((x) => x.key === c.field);
  return expectedMessage(c.messageKey, { label: f?.label ?? '' }, c.messageParams, catalog);
}

/** The value as the app is expected to store and show it again. */
export const storedValue = (f: FieldSpec, typed: string): string =>
  f.trim && typeof typed === 'string' && f.type !== 'password' ? typed.trim() : typed;

/** Fixed ids of the result checks, so reports can group them per rule [R-09]. */
export const CHECK_IDS = {
  message: 'chk-message',
  focus: 'chk-focus',
  kept: 'chk-kept',
  notSent: 'chk-not-sent',
  sent: 'chk-sent',
  saved: 'chk-saved',
} as const;

/**
 * Steps that type a case's values, send the form and check the result [R-03,
 * R-05, R-07]: the error text next to the broken field, focus on it, typed data
 * kept, nothing sent; or "sent" and the saved values read back. Checks are
 * `soft` so every one is reported, not only the first failure.
 */
export function caseSteps(form: FormSpec, c: FormCase, catalog: MessageCatalog = {}): StepInput[] {
  const steps: StepInput[] = [];
  const id = (what: string) => `${what}-${steps.length + 1}`;
  const check = (
    stepId: string,
    action: string,
    params: Record<string, unknown>,
    name: string,
  ): void => {
    steps.push({ id: stepId, action, params, name, mode: 'soft' });
  };
  if (form.path)
    steps.push({ id: id('open'), action: 'goto', params: { url: `{{app}}${form.path}` } });
  for (const f of form.fields) {
    if (f.readOnly || !(f.key in c.values)) continue;
    const value = c.values[f.key] ?? '';
    const target = locatorOf(f);
    switch (f.type) {
      case 'dropdown':
        if (value !== '')
          steps.push({
            id: id(f.key),
            action: 'select',
            params: { target, by: 'label', option: value },
            name: `${f.label}: ${value}`,
          });
        break;
      case 'checkbox':
        steps.push({
          id: id(f.key),
          action: 'check',
          params: { target, checked: value === 'true' },
          name: `${f.label}: ${value === 'true' ? 'tick' : 'bỏ tick'}`,
        });
        break;
      case 'file':
        if (value !== '')
          steps.push({
            id: id(f.key),
            action: 'upload',
            params: { target, files: value.split('@')[0] ?? value },
            name: `${f.label}: ${value}`,
            ...(value.includes('@') ? { note: `Dung lượng giả lập: ${value.split('@')[1]}` } : {}),
          });
        break;
      default:
        steps.push({
          id: id(f.key),
          action: 'fill',
          params: { target, value },
          name: `${f.label}: ${value === '' ? '(trống)' : value.length > 40 ? `${value.slice(0, 37)}…` : value}`,
        });
    }
  }
  if (form.submit)
    steps.push({
      id: id('submit'),
      action: 'click',
      params: { target: form.submit },
      name: 'Gửi form',
    });
  if (!form.submit) return steps;

  const broken = form.fields.find((x) => x.key === c.field);
  const message = expectedError(form, c, catalog);
  if (c.expect === 'reject' && broken) {
    const target = locatorOf(broken);
    if (message)
      check(
        CHECK_IDS.message,
        'assertFieldError',
        { target, op: 'equals', message },
        `Thông báo lỗi của "${broken.label}"`,
      );
    check(CHECK_IDS.focus, 'assertFocus', { target }, `Con trỏ ở ô lỗi "${broken.label}"`);
    const typed = c.values[broken.key] ?? '';
    if (
      typed.trim() !== '' &&
      typed === typed.trim() &&
      broken.type !== 'file' &&
      broken.type !== 'checkbox'
    )
      check(
        CHECK_IDS.kept,
        'assertValue',
        { target, op: 'equals', value: typed },
        `Giữ dữ liệu đã nhập ở "${broken.label}"`,
      );
    if (form.successMessage)
      check(
        CHECK_IDS.notSent,
        'assertToast',
        { text: form.successMessage, op: 'notContains' },
        'Form không được gửi',
      );
  } else if (c.expect === 'accept') {
    if (form.successMessage)
      check(
        CHECK_IDS.sent,
        'assertToast',
        { text: form.successMessage, op: 'contains' },
        'Form được gửi thành công',
      );
    const readable = form.fields.filter((f) => f.readBack && f.key in c.values);
    if (readable.length) {
      if (form.detailPath)
        steps.push({
          id: id('detail'),
          action: 'goto',
          params: { url: `{{app}}${form.detailPath}` },
          name: 'Mở lại bản đã lưu',
        });
      for (const f of readable)
        check(
          `${CHECK_IDS.saved}-${f.key}`,
          'assertText',
          {
            target: f.readBack,
            op: 'equals',
            value: storedValue(f, c.values[f.key] ?? ''),
            normalizeSpace: false,
          },
          `Lưu rồi đọc lại "${f.label}"`,
        );
    }
  }
  return steps;
}

/** Test name: "<form> – <case>". */
export const caseTestName = (form: FormSpec, c: FormCase): string => `${form.name} – ${c.name}`;

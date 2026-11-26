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

/**
 * Steps that type a case's values and send the form [R-03]. The checks of the
 * result (error text, focus, nothing sent) are added by the validation checks [R-05].
 */
export function caseSteps(form: FormSpec, c: FormCase): StepInput[] {
  const steps: StepInput[] = [];
  const id = (what: string) => `${what}-${steps.length + 1}`;
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
  return steps;
}

/** Test name: "<form> – <case>". */
export const caseTestName = (form: FormSpec, c: FormCase): string => `${form.name} – ${c.name}`;

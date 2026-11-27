import type { TestCase } from '@kiemi/schema';

type Tx = (key: string, vars?: Record<string, unknown>, fallback?: string) => string;

const KNOWN_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'option',
  'heading',
  'cell',
  'row',
  'tab',
  'menuitem',
  'img',
  'dialog',
]);

const roleWord = (role: string, tx: Tx) =>
  tx(`errors.roles.${KNOWN_ROLES.has(role) ? role : 'other'}`);

/**
 * How an element target reads for testers: `nút “Lưu”`, `ô “Họ tên”`,
 * the saved element's name… never a selector (U-05).
 */
export function describeTarget(target: unknown, elements: TestCase['elements'], tx: Tx): string {
  if (!target || typeof target !== 'object') return tx('ui.props.target.none');
  const t = target as Record<string, unknown>;
  if (typeof t.ref === 'string') return elements[t.ref]?.name ?? t.ref;
  if (typeof t.text === 'string') return `“${t.text}”`;
  if (typeof t.label === 'string') return tx('errors.element.label', { value: t.label });
  if (typeof t.placeholder === 'string')
    return tx('errors.element.placeholder', { value: t.placeholder });
  if (typeof t.role === 'string') {
    const role = roleWord(t.role, tx);
    return typeof t.name === 'string' && t.name
      ? tx('errors.element.role', { role, name: t.name })
      : role;
  }
  if (Array.isArray(t.strategies)) {
    const s = t.strategies[0] as Record<string, unknown> | undefined;
    if (s?.kind === 'role' && typeof s.role === 'string')
      return describeTarget({ role: s.role, name: s.name }, elements, tx);
    if (
      (s?.kind === 'label' || s?.kind === 'placeholder' || s?.kind === 'text') &&
      typeof s.value === 'string'
    ) {
      return describeTarget({ [s.kind]: s.value }, elements, tx);
    }
  }
  return tx('errors.element.generic');
}

/** A param value as shown in a chip. */
export function describeValue(
  key: string,
  value: unknown,
  tx: Tx,
  shared?: ReadonlyMap<string, string>,
): string {
  if (value === undefined || value === null || value === '') return '…';
  if (key === 'shared' && typeof value === 'string') return shared?.get(value) ?? value;
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'string') return tx(`ui.enums.${value}`, undefined, value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((v) => describeValue(key, v, tx, shared)).join(', ');
  return '…';
}

/** `key` is stable for a given template (its position), for React lists. */
export type SentencePart = { key: string } & (
  | { kind: 'text'; text: string }
  | { kind: 'chip'; param: string }
);

const MARK = '\u0001';

/** Splits a sentence template like `Bấm vào {{target}}` into text and chips. */
export function sentenceParts(
  template: (vars: Record<string, string>) => string,
  params: readonly string[],
): SentencePart[] {
  const vars = Object.fromEntries(params.map((p) => [p, `${MARK}${p}${MARK}`]));
  const text = template(vars);
  const parts: SentencePart[] = [];
  text.split(MARK).forEach((piece, i) => {
    if (i % 2 === 1) parts.push({ key: `p${i}`, kind: 'chip', param: piece });
    else if (piece) parts.push({ key: `p${i}`, kind: 'text', text: piece });
  });
  return parts;
}

/** Params that may appear in sentences (all keys used by the templates). */
export const SENTENCE_PARAMS = [
  'target',
  'value',
  'url',
  'option',
  'keys',
  'files',
  'to',
  'action',
  'seconds',
  'into',
  'shared',
  'timeoutSec',
  'over',
  'method',
  'state',
  'op',
  'column',
  'text',
  'name',
  'connection',
  'sql',
  'mode',
  'permissions',
  'locale',
  'expected',
  'widths',
] as const;

/** A step as plain text (reports, select boxes): `Bấm vào nút “Lưu”`. */
export function stepText(
  step: { action: string; name?: string | undefined; params: Record<string, unknown> },
  elements: TestCase['elements'],
  tx: Tx,
  shared?: ReadonlyMap<string, string>,
): string {
  if (step.name) return step.name;
  const key = `ui.steps.${step.action}.sentence`;
  const parts = sentenceParts(
    (vars) => tx(key, vars, tx('ui.steps.unknown.sentence', { ...vars, action: step.action })),
    [...SENTENCE_PARAMS],
  );
  return parts
    .map((p) => {
      if (p.kind === 'text') return p.text;
      const value =
        p.param === 'action' && !(p.param in step.params) ? step.action : step.params[p.param];
      return p.param === 'target'
        ? describeTarget(value, elements, tx)
        : describeValue(p.param, value, tx, shared);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

import { vi } from './locales/vi';

/** Error codes that have a plain-language message + hint [I-04, N-06]. */
export type ErrorCode = keyof typeof vi.errors.codes;
export const ERROR_CODES = Object.keys(vi.errors.codes) as ErrorCode[];

export interface RunErrorLike {
  code: string;
  message: string;
  details?: Record<string, unknown> | undefined;
}

/** Any `t(key, vars)` function (i18next's `t` fits). */
export type Translate = (key: string, vars?: Record<string, unknown>) => string;

export interface ErrorDescription {
  /** e.g. "Bước 5: Không tìm thấy nút “Lưu” sau 10 giây." */
  message: string;
  /** How to fix it, for testers. */
  hint: string;
}

const isCode = (c: string): c is ErrorCode => Object.hasOwn(vi.errors.codes, c);
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** "nút “Lưu”", "ô “Họ tên”"… — never selectors or other technical words. */
function describeElement(details: Record<string, unknown>, t: Translate): string {
  if (typeof details.name === 'string' && details.name)
    return t('errors.element.named', { name: details.name });
  const s = details.strategy as Record<string, unknown> | undefined;
  if (s && typeof s === 'object') {
    if (s.kind === 'role' && typeof s.role === 'string') {
      const known = Object.hasOwn(vi.errors.roles, s.role) ? s.role : 'other';
      const role = t(`errors.roles.${known}`);
      return typeof s.name === 'string' && s.name
        ? t('errors.element.role', { role, name: s.name })
        : t('errors.element.roleOnly', { role });
    }
    if (
      (s.kind === 'label' || s.kind === 'placeholder' || s.kind === 'text') &&
      typeof s.value === 'string'
    ) {
      return t(`errors.element.${s.kind}`, { value: s.value });
    }
  }
  return t('errors.element.generic');
}

function value(v: unknown, t: Translate): string {
  const s = str(v);
  return Object.hasOwn(vi.errors.values, s) ? t(`errors.values.${s}`) : s;
}

/**
 * Turns an engine error (code + details) into a message testers understand,
 * with the step number and a hint [I-04, N-06].
 */
export function describeRunError(error: RunErrorLike, t: Translate): ErrorDescription {
  const d = error.details ?? {};
  const code: ErrorCode = isCode(error.code) ? error.code : 'ENGINE_ERROR';
  const ms = typeof d.timeoutMs === 'number' ? d.timeoutMs : undefined;
  const sec =
    typeof d.timeoutSec === 'number'
      ? d.timeoutSec
      : ms === undefined
        ? undefined
        : Math.round(ms / 100) / 10;
  const vars: Record<string, unknown> = {
    ...d,
    element: describeElement(d, t),
    seconds: sec ?? '?',
    expected: value(d.expected, t),
    actual: value(d.actual, t),
    reason: str(d.reason) || error.message,
    message: str(d.message),
    count: str(d.count) || '?',
  };
  const message = t(`errors.codes.${code}.message`, vars);
  const step = str(d.stepNo) || str(d.step);
  return {
    message: step ? t('errors.stepPrefix', { step, message }) : message,
    hint: t(`errors.codes.${code}.hint`, vars),
  };
}

type TextTree = { readonly [k: string]: string | TextTree };

/** Translate function over a language tree, for code without i18next (main process, CLI). */
export function plainTranslator(tree: TextTree): Translate {
  return (key, vars = {}) => {
    let node: string | TextTree | undefined = tree;
    for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
    if (typeof node !== 'string') return key;
    return node.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => String(vars[k] ?? ''));
  };
}

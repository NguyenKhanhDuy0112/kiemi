import { describe, expect, it } from 'vitest';
import { describeRunError, ERROR_CODES, type Translate } from './errors';
import { en } from './locales/en';
import { vi } from './locales/vi';

type Tree = { readonly [k: string]: string | Tree };
const translator =
  (tree: Tree): Translate =>
  (key, vars = {}) => {
    let node: string | Tree | undefined = tree;
    for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
    if (typeof node !== 'string') return key;
    return node.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => String(vars[k] ?? ''));
  };
const tVi = translator(vi);
const tEn = translator(en);

describe('describeRunError [I-04, N-06]', () => {
  it('explains a missing element in plain Vietnamese with the step number', () => {
    const d = describeRunError(
      {
        code: 'ELEMENT_NOT_FOUND',
        message: 'Element button "Lưu" not found after 10000 ms',
        details: {
          step: 5,
          strategy: { kind: 'role', role: 'button', name: 'Lưu' },
          timeoutMs: 10_000,
        },
      },
      tVi,
    );
    expect(d.message).toBe('Bước 5: Không tìm thấy nút “Lưu” sau 10 giây.');
    expect(d.hint).toContain('Chọn lại phần tử');
  });

  it('prefers the element name and the nested step number', () => {
    const d = describeRunError(
      {
        code: 'ELEMENT_AMBIGUOUS',
        message: '',
        details: { step: 3, stepNo: '3.2', name: 'Nút Duyệt', count: 4 },
      },
      tVi,
    );
    expect(d.message).toBe('Bước 3.2: Có 4 chỗ giống “Nút Duyệt”, không biết chọn chỗ nào.');
  });

  it('never shows selectors to testers', () => {
    const d = describeRunError(
      {
        code: 'ELEMENT_NOT_FOUND',
        message: '',
        details: { step: 1, strategy: { kind: 'css', value: '#ctl00_x' }, timeoutMs: 5000 },
      },
      tVi,
    );
    expect(d.message).toBe('Bước 1: Không tìm thấy phần tử cần tìm sau 5 giây.');
    expect(d.message).not.toContain('#ctl00');
  });

  it('translates assertion values and works in English', () => {
    const err = {
      code: 'ASSERTION_FAILED',
      message: '',
      details: { step: 2, expected: 'visible', actual: 'not visible' },
    };
    expect(describeRunError(err, tVi).message).toBe(
      'Bước 2: Kiểm tra không đạt: mong đợi “hiển thị” nhưng thấy “không hiển thị”.',
    );
    expect(describeRunError(err, tEn).message).toBe(
      'Step 2: Check failed: expected “visible” but found “not visible”.',
    );
  });

  it('falls back to a generic message for unknown codes', () => {
    const d = describeRunError({ code: 'WEIRD', message: 'x' }, tVi);
    expect(d.message).toBe('Kiemi gặp lỗi ngoài dự kiến.');
  });

  it('has a message and a hint for every engine error code', () => {
    const engineCodes = [
      'UNKNOWN_ACTION',
      'INVALID_PARAMS',
      'STEP_TIMEOUT',
      'STEP_FAILED',
      'RUN_CANCELLED',
      'ENV_SKIPPED',
      'ELEMENT_NOT_FOUND',
      'ELEMENT_AMBIGUOUS',
      'BROWSER_NOT_FOUND',
      'BROWSER_DOWNLOAD_FAILED',
      'BROWSER_LAUNCH_FAILED',
      'UNKNOWN_DEVICE',
      'NO_BROWSER',
      'PROXY_SECRET_MISSING',
      'UNKNOWN_VARIABLE',
      'APP_NOT_AVAILABLE',
      'PROTECTED_ENVIRONMENT',
      'DB_NOT_AVAILABLE',
      'DB_CONNECTION_UNKNOWN',
      'DB_WRITE_BLOCKED',
      'DB_SECRET_MISSING',
      'DB_QUERY_FAILED',
      'UNKNOWN_PRODUCT',
      'INVALID_EXPRESSION',
      'CONSOLE_ERROR',
      'HTTP_ERROR',
      'ASSERTION_FAILED',
      'CONDITION_TIMEOUT',
      'API_ERROR',
      'FILE_NOT_FOUND',
      'TAB_NOT_FOUND',
      'LOGIN_NOT_SAVED',
      'LOGIN_EXPIRED',
      'UNKNOWN_SHARED_STEP',
      'ACTION_FAILED',
      'ENGINE_ERROR',
      'ENGINE_CRASHED',
      'SSH_FAILED',
    ];
    expect([...ERROR_CODES].sort()).toEqual([...engineCodes].sort());
  });
});

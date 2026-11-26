import { describe, expect, it } from 'vitest';
import {
  cleanField,
  fieldKeyFrom,
  firstFormProblem,
  newField,
  newForm,
  toNumber,
} from './form-edit';

describe('form-edit [R-01]', () => {
  it('suggests unique keys from Vietnamese labels', () => {
    expect(fieldKeyFrom('Số điện thoại')).toBe('so_dien_thoai');
    expect(fieldKeyFrom('Email', ['email'])).toBe('email_2');
    expect(fieldKeyFrom('123')).toBe('f_123');
  });

  it('reads numbers from text boxes', () => {
    expect(toNumber('')).toBeUndefined();
    expect(toNumber(' 12.5 ')).toBe(12.5);
    expect(toNumber('abc')).toBeUndefined();
  });

  it('cleans empty values and settings of other types', () => {
    const form = newForm('f', 'Form');
    const f = { ...newField(form, 'text'), pattern: '', options: ['a'], file: { extensions: [] } };
    const c = cleanField(f);
    expect('pattern' in c).toBe(false);
    expect(c.options).toEqual([]);
    expect('file' in c).toBe(false);
  });

  it('reports the first problem of a form', () => {
    expect(firstFormProblem([])).toBeNull();
    const form = { ...newForm('f', 'Form'), fields: [{ ...newField(newForm('f')), label: 'A' }] };
    expect(firstFormProblem([form])).toBeNull();
    const bad = { ...form, fields: [{ ...form.fields[0], minLength: 9, maxLength: 1 }] } as never;
    expect(firstFormProblem([bad])).toContain('minLength');
  });
});

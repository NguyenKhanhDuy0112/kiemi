import { type TestCase, TestCaseSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { DatasetConflictError, dataCandidates, toDataset } from './data';
import { applyVariant, formVariants } from './variants';

const field = (label: string, attributes: Record<string, string> = {}) => ({
  strategies: [{ kind: 'label', value: label, exact: true }],
  fingerprint: { tag: 'input', attributes, neighbors: [] },
});

const recorded = (extra: Partial<TestCase> = {}): TestCase =>
  TestCaseSchema.parse({
    schemaVersion: 2,
    id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f15',
    name: 'Đăng ký',
    tags: ['form'],
    steps: [
      { id: 's1', action: 'goto', params: { url: '/form.html' } },
      {
        id: 's2',
        action: 'fill',
        params: { target: field('Họ tên', { required: '' }), value: 'An' },
      },
      {
        id: 's3',
        action: 'fill',
        params: { target: field('Email', { type: 'email' }), value: 'an@x.vn' },
      },
      {
        id: 's4',
        action: 'select',
        params: { target: field('Bộ phận'), by: 'label', option: 'Kế toán' },
      },
      {
        id: 's5',
        action: 'fill',
        params: { target: field('Số ngày', { type: 'number', min: '1', max: '30' }), value: '2' },
      },
      { id: 's6', action: 'fill', params: { target: field('Mật khẩu'), value: '{{secret.pw}}' } },
      { id: 's7', action: 'click', params: { target: { css: '#submit' } } },
    ],
    ...extra,
  });

describe('"Biến thành dữ liệu" [M-02]', () => {
  it('lists typed / chosen values with column names, skipping variables', () => {
    expect(dataCandidates(recorded()).map((c) => `${c.stepId} ${c.column}=${c.value}`)).toEqual([
      's2 hoTen=An',
      's3 email=an@x.vn',
      's4 boPhan=Kế toán',
      's5 soNgay=2',
    ]);
  });

  it('creates table columns from the picks and uses {{row.x}} in the steps', () => {
    const tc = toDataset(recorded(), [
      { stepId: 's2', column: 'hoTen' },
      { stepId: 's4', column: 'boPhan' },
    ]);
    expect(tc.dataset).toEqual({
      source: 'table',
      columns: ['hoTen', 'boPhan'],
      rows: [{ hoTen: 'An', boPhan: 'Kế toán' }],
    });
    expect(tc.steps[1]?.params.value).toBe('{{row.hoTen}}');
    expect(tc.steps[3]?.params.option).toBe('{{row.boPhan}}');
    expect(TestCaseSchema.parse(tc)).toBeTruthy();
  });

  it('adds to an existing table (every row gets the value) and refuses file datasets', () => {
    const tc = toDataset(
      recorded({ dataset: { source: 'table', columns: ['ma'], rows: [{ ma: '1' }, { ma: '2' }] } }),
      [{ stepId: 's3', column: 'email' }],
    );
    expect(tc.dataset).toEqual({
      source: 'table',
      columns: ['ma', 'email'],
      rows: [
        { ma: '1', email: 'an@x.vn' },
        { ma: '2', email: 'an@x.vn' },
      ],
    });
    expect(dataCandidates(tc).map((c) => c.column)).toEqual(['hoTen', 'boPhan', 'soNgay']);
    expect(() =>
      toDataset(recorded({ dataset: { source: 'csv', file: 'a.csv' } }), [
        { stepId: 's2', column: 'a' },
      ]),
    ).toThrow(DatasetConflictError);
    expect(() => toDataset(recorded(), [{ stepId: 's2', column: '1x' }])).toThrow(
      DatasetConflictError,
    );
  });
});

describe('form variants [M-03]', () => {
  it('proposes empty / format / boundary / special values per field', () => {
    const v = formVariants(recorded());
    expect(v.map((x) => `${x.stepId} ${x.kind}:${x.reason}`)).toEqual([
      's2 empty:required',
      's2 boundary:tooLong',
      's2 special:special',
      's3 format:email',
      's3 boundary:tooLong',
      's3 special:special',
      's5 format:number',
      's5 boundary:zero',
      's5 boundary:negative',
      's5 boundary:belowMin',
      's5 boundary:aboveMax',
    ]);
    expect(v.find((x) => x.reason === 'aboveMax')?.value).toBe('31');
    expect(v.find((x) => x.reason === 'belowMin')?.value).toBe('0');
    expect(v.find((x) => x.stepId === 's2' && x.reason === 'tooLong')?.value).toHaveLength(256);
  });

  it('turns a variant into a copy of the test with only that value changed', () => {
    const tc = recorded();
    const v = formVariants(tc).find((x) => x.reason === 'email');
    if (!v) throw new Error('no email variant');
    const copy = applyVariant(tc, v, {
      id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f16',
      name: 'Đăng ký — Email sai định dạng',
    });
    expect(copy).toMatchObject({
      id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f16',
      name: 'Đăng ký — Email sai định dạng',
      tags: ['form', 'negative'],
    });
    expect(copy.steps[2]?.params.value).toBe('abc@');
    expect(copy.steps[1]?.params.value).toBe('An');
    expect(tc.steps[2]?.params.value).toBe('an@x.vn');
    expect(TestCaseSchema.parse(copy)).toBeTruthy();
  });
});

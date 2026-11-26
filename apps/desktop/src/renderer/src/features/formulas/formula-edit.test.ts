import { describe, expect, it } from 'vitest';
import { fromRows, newRow, splitParams, toRows } from './formula-edit';

describe('formula rows [P-03]', () => {
  it('round-trips formulas through rows', () => {
    const formulas = {
      TongDon: { params: ['ds', 'giam'], expression: "SUM(ds, 'thanhTien') - giam" },
    };
    const res = fromRows(toRows(formulas));
    expect(res).toEqual({ ok: true, formulas });
  });

  it('skips empty rows, splits inputs, rejects bad or duplicate names', () => {
    expect(splitParams(' a, b ,, c')).toEqual(['a', 'b', 'c']);
    const ok = { ...newRow('Vat'), params: 'x', expression: 'x * 0.1' };
    expect(fromRows([newRow(), ok])).toMatchObject({ ok: true });
    expect(fromRows([{ ...ok, name: '1abc' }])).toMatchObject({ ok: false });
    expect(fromRows([ok, { ...ok, key: 'z' }])).toEqual({ ok: false, error: 'duplicate:Vat' });
    expect(fromRows([ok, { ...ok, key: 'z', name: 'vat' }])).toMatchObject({ ok: false });
    expect(fromRows([{ ...newRow(), expression: '1+1' }])).toEqual({ ok: false, error: 'name' });
  });
});

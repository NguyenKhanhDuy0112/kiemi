import { EnvSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { VariableStore } from './store';
import { toNumber } from './values';

const cart = [
  { ten: 'Áo', nhom: 'Thời trang', sl: '2', gia: '150.000 ₫', thanhTien: '300.000 ₫' },
  { ten: 'Quần', nhom: 'Thời trang', sl: '1', gia: '250.000 ₫', thanhTien: '250.000 ₫' },
  { ten: 'Sách', nhom: 'Sách', sl: '3', gia: '80.000 ₫', thanhTien: '240.000 ₫' },
];
const make = (formulas = {}) => {
  const s = new VariableStore({ formulas });
  s.set('gioHang', cart);
  return s;
};
const ev = (e: string, s = make()) => s.evaluate(e);

describe('sheet functions [P-03]', () => {
  it('aggregates numbers and columns of a list (VN money is parsed)', () => {
    expect(ev('SUM(1, 2, 3)')).toBe(6);
    expect(ev("SUM(gioHang, 'thanhTien')")).toBe(790000);
    expect(ev("avg(gioHang, 'sl')")).toBe(2);
    expect(ev("MIN(gioHang, 'gia')")).toBe(80000);
    expect(ev("MAX(gioHang, 'gia')")).toBe(250000);
    expect(ev('COUNT(gioHang)')).toBe(3);
    expect(ev('COUNT(1, 2, 3, 4)')).toBe(4);
  });

  it('conditional aggregates with plain and operator criteria', () => {
    expect(ev("SUMIF(gioHang, 'nhom', 'Thời trang', 'thanhTien')")).toBe(550000);
    expect(ev("COUNTIF(gioHang, 'sl', '>=2')")).toBe(2);
    expect(ev("COUNTIF(gioHang, 'nhom', '<>Sách')")).toBe(2);
    expect(ev("COUNTIF(gioHang, 'nhom', 'sách')")).toBe(1); // ignores case
    expect(ev("FILTER(gioHang, 'gia', '>100000').length")).toBe(2);
  });

  it('IF / AND / OR / comparisons; IF is lazy', () => {
    expect(ev("IF(SUM(gioHang, 'thanhTien') >= 500000, 'free', 'ship')")).toBe('free');
    expect(ev('IF(AND(1 < 2, 2 <> 3), 10, 20)')).toBe(10);
    expect(ev('IF(OR(1 = 2, 3 > 4), 10, 20)')).toBe(20);
    expect(ev('IF(1 = 1, 5, 1 / 0)')).toBe(5);
    expect(ev("'1.250.000 ₫' = 1250000")).toBe(true);
  });

  it('rounds half, up and down, also to tens and hundreds', () => {
    expect(ev('ROUND(2.5)')).toBe(3);
    expect(ev('ROUND(1.005, 2)')).toBe(1.01);
    expect(ev('ROUNDUP(333.396, 2)')).toBe(333.4);
    expect(ev('ROUNDDOWN(333.396, 2)')).toBe(333.39);
    expect(ev('ROUND(1234567, -3)')).toBe(1235000);
    expect(ev('ROUNDUP(1231, -2)')).toBe(1300);
    expect(ev('ROUNDDOWN(-1239, -2)')).toBe(-1200);
  });

  it('reports a missing column and a text cell clearly', () => {
    expect(() => ev("SUM(gioHang, 'khongCo')")).toThrow(/no column "khongCo"/);
    expect(() => ev("SUM(gioHang, 'ten')")).toThrow(/"Áo" is not a number/);
    expect(() => ev('FILTER(1, "a", "b")')).toThrow(/must be a list/);
  });
});

describe('named formulas [P-03]', () => {
  const formulas = {
    TongDon: {
      params: ['ds', 'giam'],
      expression: "SUM(ds, 'thanhTien') - giam",
    },
    ConVat: { params: ['x'], expression: 'ROUND(x * 1.08)' },
    Vong: { params: ['x'], expression: 'Vong(x)' },
  };

  it('defines once and calls with inputs, also from another formula and in a template', () => {
    const s = make(formulas);
    expect(s.render('{{TongDon(gioHang, 90000)}}')).toBe('700000');
    expect(s.render('{{ConVat(TongDon(gioHang, 90000))}}')).toBe('756000');
    expect(s.render('{{tongdon(gioHang, 0)}}')).toBe('790000'); // case-insensitive
  });

  it('checks the number of inputs and stops endless recursion', () => {
    const s = make(formulas);
    expect(() => s.render('{{TongDon(gioHang)}}')).toThrow(/takes 2 input/);
    expect(() => s.render('{{Vong(1)}}')).toThrow(/too deeply/);
  });
});

describe('step-by-step trace [P-03]', () => {
  it('lists every intermediate result, innermost first', () => {
    const s = make({ ConVat: { params: ['x'], expression: 'ROUND(x * 1.08)' } });
    const { value, steps } = s.explain("ConVat(SUM(gioHang, 'thanhTien') - 90000)");
    expect(value).toBe(756000);
    expect(steps.map((x) => [x.text, x.value])).toEqual([
      ['SUM(gioHang, "thanhTien")', 790000],
      ['SUM(gioHang, "thanhTien") - 90000', 700000],
      ['x * 1.08', 756000],
      ['ROUND(x * 1.08)', 756000],
      ['ConVat(SUM(gioHang, "thanhTien") - 90000)', 756000],
    ]);
    expect(steps.find((x) => x.text === 'x * 1.08')?.depth).toBe(1);
  });
});

describe('Vietnamese / English numbers [P-10]', () => {
  const en = new VariableStore({ env: EnvSchema.parse({ id: 'e', name: 'EN', locale: 'en' }) });
  const vi = new VariableStore({});

  it('reads the same text by the environment locale', () => {
    expect(vi.evaluate("parseNumber('1.250.000 ₫')")).toBe(1250000);
    expect(vi.evaluate("parseNumber('1.250')")).toBe(1250);
    expect(vi.evaluate("parseNumber('12,5')")).toBe(12.5);
    expect(en.evaluate("parseNumber('1.250')")).toBe(1.25);
    expect(en.evaluate("parseNumber('1,250,000')")).toBe(1250000);
    expect(en.evaluate("parseNumber('1,250.75')")).toBe(1250.75);
    expect(toNumber('1.250', 'en')).toBe(1.25);
  });

  it('formats numbers and money by locale', () => {
    expect(vi.evaluate('formatNumber(1250000)')).toBe('1.250.000');
    expect(vi.evaluate('formatNumber(1234.5, 2)')).toBe('1.234,50');
    expect(vi.evaluate('formatMoney(1250000)')).toBe('1.250.000 ₫');
    expect(vi.evaluate('formatMoney(-999)')).toBe('-999 ₫');
    expect(en.evaluate('formatNumber(1234.5, 2)')).toBe('1,234.50');
    expect(en.evaluate('formatMoney(1250000)')).toBe('₫1,250,000');
  });
});

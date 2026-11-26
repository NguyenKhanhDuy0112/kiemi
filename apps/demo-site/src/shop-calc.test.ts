import { describe, expect, it } from 'vitest';
import { COUPONS, totals, vnd } from './shop-calc';

const cart = [
  { price: 150_000, qty: 2 },
  { price: 80_000, qty: 1 },
];

describe('shop maths [P-03]', () => {
  it('no coupon: VAT 8% and shipping under 500.000', () => {
    expect(totals(cart)).toEqual({
      subtotal: 380_000,
      discount: 0,
      vat: 30_400,
      shipping: 30_000,
      total: 440_400,
    });
  });
  it('percent and fixed coupons, VAT after discount', () => {
    expect(totals(cart, COUPONS.GIAM10)).toMatchObject({
      discount: 38_000,
      vat: 27_360,
      total: 399_360,
    });
    expect(totals(cart, COUPONS.GIAM50K)).toMatchObject({ discount: 50_000, vat: 26_400 });
  });
  it('free shipping from 500.000 after discount or with FREESHIP', () => {
    expect(totals([{ price: 450_000, qty: 2 }]).shipping).toBe(0);
    expect(
      totals(
        [
          { price: 450_000, qty: 1 },
          { price: 80_000, qty: 1 },
        ],
        COUPONS.GIAM10,
      ).shipping,
    ).toBe(30_000); // 477.000 left
    expect(totals(cart, COUPONS.FREESHIP).shipping).toBe(0);
  });
  it('empty cart is all zero; the bug taxes before the discount', () => {
    expect(totals([]).total).toBe(0);
    expect(totals(cart, COUPONS.GIAM10, true).vat).toBe(30_400);
  });
  it('prints money the Vietnamese way', () => {
    expect(vnd(1_250_000)).toMatch(/^1\.250\.000\s₫$/);
  });
});

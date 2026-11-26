export interface Item {
  sku: string;
  name: string;
  price: number;
}

export const CATALOG: readonly Item[] = [
  { sku: 'AT01', name: 'Áo thun', price: 150_000 },
  { sku: 'QJ02', name: 'Quần jeans', price: 450_000 },
  { sku: 'GT03', name: 'Giày thể thao', price: 900_000 },
  { sku: 'MN04', name: 'Mũ lưỡi trai', price: 80_000 },
];

export const VAT_RATE = 0.08;
export const SHIPPING_FEE = 30_000;
/** Free shipping from this amount (after the discount). */
export const FREE_SHIP_FROM = 500_000;

export interface Coupon {
  /** Percent off the subtotal. */
  percent?: number;
  /** Fixed amount off. */
  amount?: number;
  freeShip?: boolean;
}

export const COUPONS: Record<string, Coupon> = {
  GIAM10: { percent: 10 },
  GIAM50K: { amount: 50_000 },
  FREESHIP: { freeShip: true },
};

export interface Totals {
  subtotal: number;
  discount: number;
  vat: number;
  shipping: number;
  total: number;
}

/**
 * Cart maths: discount → VAT 8% on what is left → shipping (free from
 * 500.000 after discount, or with FREESHIP). `bugVat` taxes before the discount.
 */
export function totals(
  lines: readonly { price: number; qty: number }[],
  coupon?: Coupon,
  bugVat = false,
): Totals {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discount = Math.min(
    subtotal,
    Math.round((coupon?.percent ? (subtotal * coupon.percent) / 100 : 0) + (coupon?.amount ?? 0)),
  );
  const vat = Math.round((bugVat ? subtotal : subtotal - discount) * VAT_RATE);
  const shipping =
    subtotal === 0 || coupon?.freeShip || subtotal - discount >= FREE_SHIP_FROM ? 0 : SHIPPING_FEE;
  return { subtotal, discount, vat, shipping, total: subtotal - discount + vat + shipping };
}

export const vnd = (n: number): string => `${n.toLocaleString('vi-VN')} ₫`;

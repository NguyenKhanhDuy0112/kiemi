import { z } from 'zod';

/**
 * Key of a product inside a project: used in `{{app.<key>}}` and as the folder
 * name under `tests/` [O-01, O-02, ADR 0018].
 */
export const ProductKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,31}$/, 'Product key must be lowercase letters, digits or `_`');

export const PRODUCT_KINDS = ['web', 'api', 'app', 'module'] as const;
export const ProductKindSchema = z.enum(PRODUCT_KINDS);
export type ProductKind = z.infer<typeof ProductKindSchema>;

/** A product of a project (customer web, admin site, API…) [O-01]. */
export const ProductSchema = z.object({
  id: z.string().min(1),
  key: ProductKeySchema,
  name: z.string().trim().min(1).max(100),
  kind: ProductKindSchema.default('web'),
  sortOrder: z.number().int().default(0),
});
export type Product = z.infer<typeof ProductSchema>;

/** Key of the product every v1.0 project is moved into. */
export const DEFAULT_PRODUCT_KEY = 'web';

/** Suggests a key from a name: "Trang quản trị" → "trang_quan_tri". */
export function productKeyFrom(name: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  let base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
  if (!/^[a-z]/.test(base)) base = `p${base ? `_${base}` : ''}`.slice(0, 28);
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
  return key;
}

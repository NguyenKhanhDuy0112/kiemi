import {
  DEFAULT_PRODUCT_KEY,
  ProductKeySchema,
  ProductKindSchema,
  productKeyFrom,
} from '@kiemi/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DbError, type Patch, Repo, type RepoContext, validation } from '../repo';
import { elements, environmentProducts, folders, products, projects, testCases } from '../tables';

export const ProductInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  /** Suggested from the name when left out. */
  key: ProductKeySchema.optional(),
  kind: ProductKindSchema.default('web'),
});

export type ProductRow = typeof products.$inferSelect;

/** Products of a project (web, admin, API…); tests, folders and elements belong to one [O-01]. */
export class ProductService {
  readonly repo: Repo<typeof products>;
  readonly #ctx: RepoContext;
  constructor(ctx: RepoContext) {
    this.#ctx = ctx;
    this.repo = new Repo(ctx, products, 'product');
  }

  /** Ordered products; a project always has at least one (created on demand). */
  list(projectId: string): ProductRow[] {
    const rows = this.repo.list(eq(products.projectId, projectId), products.sortOrder);
    if (rows.length) return rows;
    this.defaultFor(projectId);
    return this.repo.list(eq(products.projectId, projectId), products.sortOrder);
  }

  get(id: string): ProductRow {
    return this.repo.get(id);
  }

  create(input: z.input<typeof ProductInputSchema>): ProductRow {
    const p = ProductInputSchema.safeParse(input);
    if (!p.success) throw validation('product', p.error.issues);
    const existing = this.list(p.data.projectId);
    const key =
      p.data.key ??
      productKeyFrom(
        p.data.name,
        existing.map((x) => x.key),
      );
    this.#uniqueKey(existing, key);
    return this.repo.create({
      projectId: p.data.projectId,
      key,
      name: p.data.name,
      kind: p.data.kind,
      sortOrder: existing.length,
    });
  }

  update(
    id: string,
    input: Patch<Omit<z.input<typeof ProductInputSchema>, 'projectId'>>,
    expectedVersion?: number,
  ): ProductRow {
    const p = ProductInputSchema.omit({ projectId: true }).partial().safeParse(input);
    if (!p.success) throw validation('product', p.error.issues);
    const cur = this.repo.get(id);
    if (p.data.key !== undefined && p.data.key !== cur.key)
      this.#uniqueKey(this.repo.list(eq(products.projectId, cur.projectId)), p.data.key);
    return this.repo.update(id, p.data, expectedVersion);
  }

  /** Soft-deletes the product with its folders, tests and elements (undo = restore each). */
  remove(id: string): void {
    const cur = this.repo.get(id);
    const siblings = this.repo.list(eq(products.projectId, cur.projectId));
    if (siblings.length <= 1)
      throw new DbError('VALIDATION', 'A project needs at least one product', {
        entity: 'product',
        reason: 'lastProduct',
      });
    const tests = new Repo(this.#ctx, testCases, 'test case');
    const fs = new Repo(this.#ctx, folders, 'folder');
    const els = new Repo(this.#ctx, elements, 'element');
    const cells = new Repo(this.#ctx, environmentProducts, 'environment cell');
    this.#ctx.db.transaction(() => {
      for (const c of cells.list(eq(environmentProducts.productId, id))) cells.remove(c.id);
      for (const t of tests.list(eq(testCases.productId, id))) tests.remove(t.id);
      for (const f of fs.list(eq(folders.productId, id))) fs.remove(f.id);
      for (const e of els.list(eq(elements.productId, id))) els.remove(e.id);
      this.repo.remove(id);
    });
  }

  /**
   * The project's first product, creating "Web" (`web`) when there is none, and
   * moving folders/tests/elements without a product into it (v1.0 data) [O-01].
   */
  defaultFor(projectId: string): ProductRow {
    const first = this.repo.list(eq(products.projectId, projectId), products.sortOrder)[0];
    const product =
      first ??
      this.repo.create({
        projectId,
        key: DEFAULT_PRODUCT_KEY,
        name: 'Web',
        kind: 'web',
        sortOrder: 0,
      });
    if (!first) this.#adopt(projectId, product.id);
    return product;
  }

  /** Startup: every project has a product and nothing is left without one. */
  backfillAll(): void {
    const all = this.#ctx.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.workspaceId, this.#ctx.workspaceId), isNull(projects.deletedAt)))
      .all();
    for (const p of all) this.#adopt(p.id, this.defaultFor(p.id).id);
  }

  /** Resolves "which product" for a new item: explicit → parent folder's → default. */
  resolve(projectId: string, productId: string | null | undefined): string {
    if (productId) {
      const p = this.repo.get(productId);
      if (p.projectId !== projectId)
        throw new DbError('VALIDATION', 'Product of another project', { entity: 'product' });
      return p.id;
    }
    return this.defaultFor(projectId).id;
  }

  /** Data migration (no version bump): rows without a product join `productId`. */
  #adopt(projectId: string, productId: string): void {
    const db = this.#ctx.db;
    for (const table of [folders, testCases, elements]) {
      db.update(table)
        .set({ productId })
        .where(and(eq(table.projectId, projectId), isNull(table.productId)))
        .run();
    }
  }

  #uniqueKey(existing: ProductRow[], key: string): void {
    if (existing.some((x) => x.key === key))
      throw new DbError('NAME_TAKEN', `Product key "${key}" already exists`, {
        entity: 'product',
        name: key,
      });
  }
}

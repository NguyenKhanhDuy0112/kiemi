import { LocatorSchema } from '@kiemi/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type Patch, Repo, type RepoContext, validation } from '../repo';
import { elements } from '../tables';
import { ProductService } from './products';

export const ElementInputSchema = z.object({
  projectId: z.string().min(1),
  /** Each product has its own library (default = first product) [O-01]. */
  productId: z.string().min(1).nullish(),
  name: z.string().trim().min(1).max(200),
  locator: LocatorSchema,
  pageUrl: z.string().nullish(),
});

/** Project element library (picked elements with locator strategies) [C-01, C-02]. */
export class ElementService {
  readonly repo: Repo<typeof elements>;
  readonly #ctx: RepoContext;
  constructor(ctx: RepoContext) {
    this.#ctx = ctx;
    this.repo = new Repo(ctx, elements, 'element');
  }
  list(projectId: string, productId?: string) {
    return this.repo.list(
      productId
        ? and(eq(elements.projectId, projectId), eq(elements.productId, productId))
        : eq(elements.projectId, projectId),
      elements.name,
    );
  }
  get(id: string) {
    return this.repo.get(id);
  }
  create(input: z.input<typeof ElementInputSchema>) {
    const p = ElementInputSchema.safeParse(input);
    if (!p.success) throw validation('element', p.error.issues);
    return this.repo.create({
      ...p.data,
      productId: new ProductService(this.#ctx).resolve(p.data.projectId, p.data.productId),
      pageUrl: p.data.pageUrl ?? null,
    });
  }
  update(
    id: string,
    input: Patch<Omit<z.input<typeof ElementInputSchema>, 'projectId' | 'productId'>>,
    expectedVersion?: number,
  ) {
    const p = ElementInputSchema.omit({ projectId: true, productId: true })
      .partial()
      .safeParse(input);
    if (!p.success) throw validation('element', p.error.issues);
    return this.repo.update(id, p.data, expectedVersion);
  }
  remove(id: string) {
    this.repo.remove(id);
  }
}

import {
  type FormSpec,
  FormSpecsSchema,
  type MessageCatalog,
  MessageCatalogSchema,
  type PopupRule,
  PopupRulesSchema,
  VariableNameSchema,
} from '@kiemi/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DbError, type Patch, Repo, type RepoContext, validation } from '../repo';
import { folders, projects, testCases } from '../tables';
import { ProductService } from './products';

const name = z.string().trim().min(1).max(200);
export const ProjectInputSchema = z.object({ name, description: z.string().max(2000).nullish() });
export const FolderInputSchema = z.object({
  projectId: z.string().min(1),
  /** Top-level folders: which product (default = first). Sub-folders follow their parent. */
  productId: z.string().min(1).nullish(),
  parentId: z.string().min(1).nullish(),
  name,
});

export class ProjectService {
  readonly repo: Repo<typeof projects>;
  readonly #ctx: RepoContext;
  constructor(ctx: RepoContext) {
    this.#ctx = ctx;
    this.repo = new Repo(ctx, projects, 'project');
  }
  list() {
    return this.repo.list(undefined, projects.name);
  }
  get(id: string) {
    return this.repo.get(id);
  }
  create(input: z.input<typeof ProjectInputSchema>) {
    const p = ProjectInputSchema.safeParse(input);
    if (!p.success) throw validation('project', p.error.issues);
    const row = this.repo.create({ name: p.data.name, description: p.data.description ?? null });
    new ProductService(this.#ctx).defaultFor(row.id);
    return row;
  }
  update(id: string, input: Patch<z.input<typeof ProjectInputSchema>>, expectedVersion?: number) {
    const p = ProjectInputSchema.partial().safeParse(input);
    if (!p.success) throw validation('project', p.error.issues);
    return this.repo.update(id, p.data, expectedVersion);
  }
  remove(id: string) {
    this.repo.remove(id);
  }
  /** Popups every test of the project closes by itself [W-09]. */
  setPopupRules(id: string, rules: unknown) {
    const p = PopupRulesSchema.safeParse(rules);
    if (!p.success) throw validation('popupRule', p.error.issues);
    return this.repo.update(id, { popupRules: p.data });
  }
  popupRules(id: string): PopupRule[] {
    return this.repo.get(id).popupRules ?? [];
  }
  /** Field specs of the project's forms [R-01]. */
  setFormSpecs(id: string, forms: unknown) {
    const p = FormSpecsSchema.safeParse(forms);
    if (!p.success) throw validation('formSpec', p.error.issues);
    return this.repo.update(id, { formSpecs: p.data });
  }
  formSpecs(id: string): FormSpec[] {
    return this.repo.get(id).formSpecs ?? [];
  }
  /** Error messages the project words differently from the defaults [R-10]. */
  setMessageCatalog(id: string, messages: unknown) {
    const p = MessageCatalogSchema.safeParse(messages);
    if (!p.success) throw validation('messageCatalog', p.error.issues);
    return this.repo.update(id, { messageCatalog: p.data });
  }
  messageCatalog(id: string): MessageCatalog {
    return this.repo.get(id).messageCatalog ?? {};
  }
  /** Project-level variables, inherited by every test of the project [O-04]. */
  setVariables(id: string, values: Record<string, string>) {
    const p = z.record(VariableNameSchema, z.string()).safeParse(values);
    if (!p.success) throw validation('variable', p.error.issues);
    return this.repo.update(id, { variables: p.data });
  }
}

export class FolderService {
  readonly repo: Repo<typeof folders>;
  readonly #ctx: RepoContext;
  constructor(ctx: RepoContext) {
    this.#ctx = ctx;
    this.repo = new Repo(ctx, folders, 'folder');
  }
  list(projectId: string) {
    return this.repo.list(eq(folders.projectId, projectId), folders.sortOrder);
  }
  create(input: z.input<typeof FolderInputSchema>) {
    const p = FolderInputSchema.safeParse(input);
    if (!p.success) throw validation('folder', p.error.issues);
    const parent = p.data.parentId ? this.repo.get(p.data.parentId) : undefined;
    const productId =
      parent?.productId ??
      new ProductService(this.#ctx).resolve(p.data.projectId, p.data.productId);
    const siblings = this.list(p.data.projectId).filter(
      (f) => (f.parentId ?? null) === (p.data.parentId ?? null) && f.productId === productId,
    );
    return this.repo.create({
      projectId: p.data.projectId,
      productId,
      parentId: p.data.parentId ?? null,
      name: p.data.name,
      sortOrder: siblings.length,
    });
  }
  rename(id: string, newName: string, expectedVersion?: number) {
    const n = name.safeParse(newName);
    if (!n.success) throw validation('folder', n.error.issues);
    return this.repo.update(id, { name: n.data }, expectedVersion);
  }
  /**
   * Move under another folder (or the root of a product); refuses to move into itself /
   * a descendant. Moving to another product takes the sub-folders and tests along [O-01].
   */
  move(id: string, parentId: string | null, sortOrder?: number, productId?: string) {
    const folder = this.repo.get(id);
    if (parentId) {
      let cur: string | null = parentId;
      while (cur) {
        if (cur === id)
          throw new DbError('VALIDATION', 'A folder cannot be moved into itself', { id, parentId });
        cur = this.repo.get(cur).parentId;
      }
    }
    const target = parentId
      ? this.repo.get(parentId).productId
      : productId
        ? new ProductService(this.#ctx).resolve(folder.projectId, productId)
        : folder.productId;
    return this.#ctx.db.transaction(() => {
      if (target && target !== folder.productId) this.#reassign(folder.id, target);
      return this.repo.update(folder.id, {
        parentId,
        ...(sortOrder === undefined ? {} : { sortOrder }),
      });
    });
  }

  /** Folder subtree (ids, including `id`). */
  subtree(id: string): Set<string> {
    const all = this.list(this.repo.get(id).projectId);
    const out = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of all) {
        if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
          out.add(f.id);
          grew = true;
        }
      }
    }
    return out;
  }

  #reassign(id: string, productId: string): void {
    const tests = new Repo(this.#ctx, testCases, 'test case');
    for (const fid of this.subtree(id)) {
      this.repo.update(fid, { productId });
      for (const t of tests.list(eq(testCases.folderId, fid))) tests.update(t.id, { productId });
    }
  }
  /** Soft-deletes the folder, its sub-folders and the tests inside. */
  remove(id: string) {
    const doomed = this.subtree(id);
    const tests = new Repo(this.#ctx, testCases, 'test case');
    this.#ctx.db.transaction(() => {
      for (const fid of doomed) {
        for (const t of tests.list(and(eq(testCases.folderId, fid), isNull(testCases.deletedAt))))
          tests.remove(t.id);
        this.repo.remove(fid);
      }
    });
  }
}

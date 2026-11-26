import { LocatorSchema, type SharedStep, SharedStepSchema } from '@kiemi/schema';
import { z } from 'zod';
import { type Patch, Repo, type RepoContext, validation } from '../repo';
import { type SharedResourceData, sharedResources } from '../tables';

const StepData = z.object({
  params: SharedStepSchema.shape.params,
  steps: SharedStepSchema.shape.steps,
});
const ElementData = z.object({ locator: LocatorSchema, pageUrl: z.string().nullish() });

export const SharedResourceInputSchema = z
  .object({
    kind: z.enum(['shared_step', 'element']),
    scope: z.enum(['workspace', 'project', 'product']),
    projectId: z.string().min(1).nullish(),
    productId: z.string().min(1).nullish(),
    name: z.string().trim().min(1).max(200),
    data: z.unknown(),
  })
  .superRefine((v, ctx) => {
    const bad = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    if (v.scope === 'workspace' && (v.projectId || v.productId))
      bad('workspace scope has no project/product', 'scope');
    if (v.scope !== 'workspace' && !v.projectId) bad('project required', 'projectId');
    if (v.scope === 'product' && !v.productId) bad('product required', 'productId');
    if (v.scope === 'project' && v.productId) bad('project scope has no product', 'productId');
    const parsed = (v.kind === 'shared_step' ? StepData : ElementData).safeParse(v.data);
    if (!parsed.success)
      for (const i of parsed.error.issues)
        ctx.addIssue({ code: 'custom', message: i.message, path: ['data', ...i.path] });
  });
/** Validated content with defaults applied (the input check already passed). */
function parseData(kind: 'shared_step' | 'element', data: unknown): SharedResourceData {
  return (kind === 'shared_step' ? StepData : ElementData).parse(data) as SharedResourceData;
}

export type SharedResourceInput = z.input<typeof SharedResourceInputSchema>;

/** Steps and elements shared across projects (workspace library) [O-07]. */
export class SharedResourceService {
  readonly repo: Repo<typeof sharedResources>;
  constructor(ctx: RepoContext) {
    this.repo = new Repo(ctx, sharedResources, 'shared resource');
  }
  /** Resources visible to a project: workspace library + its project/product ones. */
  list(
    filter: { kind?: 'shared_step' | 'element' | undefined; projectId?: string | undefined } = {},
  ) {
    return this.repo
      .list(undefined, sharedResources.name)
      .filter(
        (r) =>
          (!filter.kind || r.kind === filter.kind) &&
          (r.scope === 'workspace' || !filter.projectId || r.projectId === filter.projectId),
      );
  }
  get(id: string) {
    return this.repo.get(id);
  }
  create(input: SharedResourceInput) {
    const p = SharedResourceInputSchema.safeParse(input);
    if (!p.success) throw validation('shared resource', p.error.issues);
    const d = p.data;
    return this.repo.create({
      kind: d.kind,
      scope: d.scope,
      projectId: d.projectId ?? null,
      productId: d.productId ?? null,
      name: d.name,
      data: parseData(d.kind, d.data),
    });
  }
  /** Renames or replaces the content; kind and scope never change. */
  update(id: string, patch: Patch<{ name: string; data: unknown }>, expectedVersion?: number) {
    const cur = this.repo.get(id);
    const p = SharedResourceInputSchema.safeParse({
      kind: cur.kind,
      scope: cur.scope,
      projectId: cur.projectId,
      productId: cur.productId,
      name: patch.name ?? cur.name,
      data: patch.data ?? cur.data,
    });
    if (!p.success) throw validation('shared resource', p.error.issues);
    return this.repo.update(
      id,
      { name: p.data.name, data: parseData(p.data.kind, p.data.data) },
      expectedVersion,
    );
  }
  remove(id: string) {
    this.repo.remove(id);
  }
  /** Copies a project-level shared step into the workspace library (same name, new id). */
  promoteSharedStep(step: Pick<SharedStep, 'name' | 'params' | 'steps'>) {
    return this.create({
      kind: 'shared_step',
      scope: 'workspace',
      name: step.name,
      data: { params: step.params, steps: step.steps },
    });
  }
  /** Workspace-library shared steps in engine shape; calls reference them by id [D-01]. */
  sharedStepsForRun(): SharedStep[] {
    return this.list({ kind: 'shared_step' })
      .filter((r) => r.scope === 'workspace')
      .map((r) => {
        const d = r.data as { params: SharedStep['params']; steps: SharedStep['steps'] };
        return { id: r.id, name: r.name, params: d.params, steps: d.steps };
      });
  }
}

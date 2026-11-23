import { type SharedStep, SharedStepSchema } from '@kiemi/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type Patch, Repo, type RepoContext, validation } from '../repo';
import { sharedSteps } from '../tables';

export const SharedStepInputSchema = SharedStepSchema.omit({ id: true }).extend({
  projectId: z.string().min(1),
  /** `null` = shared by every product of the project [O-07]. */
  productId: z.string().min(1).nullish(),
});

/** Reusable step groups "Đăng nhập(user, pass)" [D-01]. */
export class SharedStepService {
  readonly repo: Repo<typeof sharedSteps>;
  constructor(ctx: RepoContext) {
    this.repo = new Repo(ctx, sharedSteps, 'shared step');
  }
  list(projectId: string) {
    return this.repo.list(eq(sharedSteps.projectId, projectId), sharedSteps.name);
  }
  get(id: string) {
    return this.repo.get(id);
  }
  create(input: z.input<typeof SharedStepInputSchema>) {
    const p = SharedStepInputSchema.safeParse(input);
    if (!p.success) throw validation('shared step', p.error.issues);
    return this.repo.create({ ...p.data, productId: p.data.productId ?? null });
  }
  update(
    id: string,
    input: Patch<Omit<z.input<typeof SharedStepInputSchema>, 'projectId'>>,
    expectedVersion?: number,
  ) {
    const p = SharedStepInputSchema.omit({ projectId: true }).partial().safeParse(input);
    if (!p.success) throw validation('shared step', p.error.issues);
    return this.repo.update(id, p.data, expectedVersion);
  }
  remove(id: string) {
    this.repo.remove(id);
  }
  /** Engine shape (`RunRequest.sharedSteps`). */
  forRun(projectId: string): SharedStep[] {
    return this.list(projectId).map((r) => ({
      id: r.id,
      name: r.name,
      params: r.params,
      steps: r.steps,
    }));
  }
}

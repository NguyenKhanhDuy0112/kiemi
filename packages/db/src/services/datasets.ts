import { type Dataset, DatasetSchema } from '@kiemi/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { readCsv } from '../io/csv';
import { readExcel } from '../io/excel';
import { type Patch, Repo, type RepoContext, validation } from '../repo';
import { datasets } from '../tables';

export const DatasetInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  columns: z.array(z.string().trim().min(1)).min(1),
  rows: z.array(z.record(z.string(), z.string())).default([]),
});

/** Test data: manual table or imported Excel/CSV; each row = one run [E-03]. */
export class DatasetService {
  readonly repo: Repo<typeof datasets>;
  constructor(ctx: RepoContext) {
    this.repo = new Repo(ctx, datasets, 'dataset');
  }
  list(projectId: string) {
    return this.repo.list(eq(datasets.projectId, projectId), datasets.name);
  }
  get(id: string) {
    return this.repo.get(id);
  }

  /** Manual table. */
  create(input: z.input<typeof DatasetInputSchema>) {
    const p = this.#validate(input);
    return this.repo.create({ ...p, source: { kind: 'manual' } });
  }

  /** Edits columns/rows (manual editing or after import). */
  update(
    id: string,
    input: Patch<{ name: string; columns: string[]; rows: Record<string, string>[] }>,
    expectedVersion?: number,
  ) {
    const cur = this.repo.get(id);
    const p = this.#validate({
      projectId: cur.projectId,
      name: input.name ?? cur.name,
      columns: input.columns ?? cur.columns,
      rows: input.rows ?? cur.rows,
    });
    return this.repo.update(
      id,
      { name: p.name, columns: p.columns, rows: p.rows },
      expectedVersion,
    );
  }

  importCsv(
    projectId: string,
    name: string,
    fileName: string,
    data: string | Uint8Array,
    delimiter?: string,
  ) {
    const t = readCsv(data, delimiter);
    const p = this.#validate({ projectId, name, ...t });
    return this.repo.create({ ...p, source: { kind: 'csv', fileName } });
  }

  async importExcel(
    projectId: string,
    name: string,
    fileName: string,
    data: Uint8Array,
    sheet?: string,
  ) {
    const t = await readExcel(data, sheet);
    const p = this.#validate({ projectId, name, columns: t.columns, rows: t.rows });
    return this.repo.create({ ...p, source: { kind: 'excel', fileName, sheet: t.sheet } });
  }

  remove(id: string) {
    this.repo.remove(id);
  }

  /**
   * Rows used instead when running on `environmentId` (same columns); `null`
   * goes back to the default rows [O-05].
   */
  setEnvironmentRows(id: string, environmentId: string, rows: Record<string, string>[] | null) {
    const cur = this.repo.get(id);
    const next = { ...(cur.envRows ?? {}) };
    if (rows === null) delete next[environmentId];
    else {
      this.#validate({ projectId: cur.projectId, name: cur.name, columns: cur.columns, rows });
      next[environmentId] = rows;
    }
    return this.repo.update(id, { envRows: Object.keys(next).length ? next : null });
  }

  /** Engine shape (`RunRequest.dataset`): the environment's own rows when it has some [O-05]. */
  forRun(id: string, environmentId?: string | null): Dataset {
    const r = this.repo.get(id);
    const rows = (environmentId && r.envRows?.[environmentId]) || r.rows;
    return DatasetSchema.parse({ id: r.id, name: r.name, columns: r.columns, rows });
  }

  #validate(input: z.input<typeof DatasetInputSchema>) {
    const p = DatasetInputSchema.safeParse(input);
    if (!p.success) throw validation('dataset', p.error.issues);
    const ds = DatasetSchema.safeParse({
      id: 'x',
      name: p.data.name,
      columns: p.data.columns,
      rows: p.data.rows,
    });
    if (!ds.success) throw validation('dataset', ds.error.issues);
    return p.data;
  }
}

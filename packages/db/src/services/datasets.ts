import { type Dataset, DatasetChildSchema, DatasetSchema } from '@kiemi/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { readCsv } from '../io/csv';
import { excelSheets, readExcel } from '../io/excel';
import type { Table } from '../io/table';
import { DbError, type Patch, Repo, type RepoContext, validation } from '../repo';
import { datasets } from '../tables';

export const DatasetInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  columns: z.array(z.string().trim().min(1)).min(1),
  rows: z.array(z.record(z.string(), z.string())).default([]),
  children: z.array(DatasetChildSchema).optional(),
});

/**
 * Column that links a child sheet to its parent: the parent's first column
 * that the child also has [P-01]; `undefined` when they share none.
 */
export function detectLink(parent: string[], child: string[]): string | undefined {
  return parent.find((c) => child.includes(c));
}

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
    return this.repo.create({ ...p, children: p.children ?? null, source: { kind: 'manual' } });
  }

  /** Edits columns/rows (manual editing or after import). */
  update(
    id: string,
    input: Patch<{
      name: string;
      columns: string[];
      rows: Record<string, string>[];
      children: z.infer<typeof DatasetChildSchema>[] | null;
    }>,
    expectedVersion?: number,
  ) {
    const cur = this.repo.get(id);
    const p = this.#validate({
      projectId: cur.projectId,
      name: input.name ?? cur.name,
      columns: input.columns ?? cur.columns,
      rows: input.rows ?? cur.rows,
      children:
        input.children === undefined ? (cur.children ?? undefined) : (input.children ?? undefined),
    });
    return this.repo.update(
      id,
      { name: p.name, columns: p.columns, rows: p.rows, children: p.children ?? null },
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
    return this.repo.create({ ...p, children: null, source: { kind: 'csv', fileName } });
  }

  async importExcel(
    projectId: string,
    name: string,
    fileName: string,
    data: Uint8Array,
    sheet?: string,
    /** Every other sheet becomes a child table linked by a shared column [P-01]. */
    linked = false,
  ) {
    const t = await readExcel(data, sheet);
    const children: z.infer<typeof DatasetChildSchema>[] = [];
    if (linked) {
      for (const other of await excelSheets(data)) {
        if (other === t.sheet) continue;
        const c: Table = await readExcel(data, other);
        const key = detectLink(t.columns, c.columns);
        if (key === undefined) {
          throw new DbError(
            'IMPORT_FAILED',
            `Sheet "${other}" shares no column with "${t.sheet}"`,
            {
              reason: 'noLink',
              sheet: other,
            },
          );
        }
        children.push({ name: other, key, parentKey: key, columns: c.columns, rows: c.rows });
      }
    }
    const p = this.#validate({
      projectId,
      name,
      columns: t.columns,
      rows: t.rows,
      ...(children.length ? { children } : {}),
    });
    return this.repo.create({
      ...p,
      children: p.children ?? null,
      source: { kind: 'excel', fileName, sheet: t.sheet },
    });
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
      this.#validate({
        projectId: cur.projectId,
        name: cur.name,
        columns: cur.columns,
        rows,
        ...(cur.children ? { children: cur.children } : {}),
      });
      next[environmentId] = rows;
    }
    return this.repo.update(id, { envRows: Object.keys(next).length ? next : null });
  }

  /** Engine shape (`RunRequest.dataset`): the environment's own rows when it has some [O-05]. */
  forRun(id: string, environmentId?: string | null): Dataset {
    const r = this.repo.get(id);
    const rows = (environmentId && r.envRows?.[environmentId]) || r.rows;
    return DatasetSchema.parse({
      id: r.id,
      name: r.name,
      columns: r.columns,
      rows,
      ...(r.children?.length ? { children: r.children } : {}),
    });
  }

  #validate(input: z.input<typeof DatasetInputSchema>) {
    const p = DatasetInputSchema.safeParse(input);
    if (!p.success) throw validation('dataset', p.error.issues);
    const ds = DatasetSchema.safeParse({
      id: 'x',
      name: p.data.name,
      columns: p.data.columns,
      rows: p.data.rows,
      children: p.data.children,
    });
    if (!ds.success) throw validation('dataset', ds.error.issues);
    return p.data;
  }
}

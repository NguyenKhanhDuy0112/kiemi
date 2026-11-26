import { z } from 'zod';

/** A cell value from Excel/CSV or the manual table. Stored as text, resolved later. */
export const DataRowSchema = z.record(z.string(), z.string());
export type DataRow = z.infer<typeof DataRowSchema>;

/**
 * A table linked to the dataset's rows by a key [P-01]: the rows of the
 * current parent row are the child rows whose `key` equals the parent's
 * `parentKey` (`Bo.maBo ↔ SanPham.maBo`).
 */
export const DatasetChildSchema = z.object({
  /** Name used by `loop` (`over: children`) — usually the sheet name. */
  name: z.string().min(1),
  /** Child column holding the link. */
  key: z.string().min(1),
  /** Column of the parent table the link points to. */
  parentKey: z.string().min(1),
  columns: z.array(z.string().min(1)),
  rows: z.array(DataRowSchema),
});
export type DatasetChild = z.infer<typeof DatasetChildSchema>;

/** Loaded dataset: each row = one run of the test [E-03]. */
export const DatasetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    columns: z.array(z.string().min(1)),
    rows: z.array(DataRowSchema),
    children: z.array(DatasetChildSchema).optional(),
  })
  .superRefine((ds, ctx) => {
    const seen = new Set<string>();
    for (const col of ds.columns) {
      if (seen.has(col)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate column "${col}"`, path: ['columns'] });
      }
      seen.add(col);
    }
    const names = new Set<string>();
    ds.children?.forEach((c, i) => {
      if (names.has(c.name) || c.name === 'children') {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate child table "${c.name}"`,
          path: ['children', i],
        });
      }
      names.add(c.name);
      if (!c.columns.includes(c.key)) {
        ctx.addIssue({
          code: 'custom',
          message: `Unknown key column "${c.key}" in "${c.name}"`,
          path: ['children', i, 'key'],
        });
      }
      if (!seen.has(c.parentKey)) {
        ctx.addIssue({
          code: 'custom',
          message: `Unknown parent column "${c.parentKey}"`,
          path: ['children', i, 'parentKey'],
        });
      }
    });
    ds.rows.forEach((row, i) => {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          ctx.addIssue({ code: 'custom', message: `Unknown column "${key}"`, path: ['rows', i] });
        }
      }
    });
  });
export type Dataset = z.infer<typeof DatasetSchema>;

/** Child rows that belong to one parent row [P-01]; `undefined` when `name` is not a child table. */
export function childRowsOf(
  dataset: Pick<Dataset, 'children'>,
  parent: DataRow,
  name: string,
): DataRow[] | undefined {
  const child = dataset.children?.find((c) => c.name === name);
  if (!child) return undefined;
  const link = parent[child.parentKey] ?? '';
  return child.rows.filter((r) => (r[child.key] ?? '') === link);
}

/** How a test case points at its data [E-03]. */
export const DatasetSourceSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.enum(['excel', 'csv']),
    /** Path relative to the test file / workspace. */
    file: z.string().min(1),
    sheet: z.string().optional(),
  }),
  z.object({
    source: z.literal('table'),
    columns: z.array(z.string().min(1)),
    rows: z.array(DataRowSchema),
  }),
  z.object({ source: z.literal('saved'), datasetId: z.string().min(1) }),
]);
export type DatasetSource = z.infer<typeof DatasetSourceSchema>;

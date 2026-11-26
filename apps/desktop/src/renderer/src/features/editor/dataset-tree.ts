import { childRowsOf, type DataRow, type DatasetChild } from '@kiemi/schema';

export interface TreeChild {
  name: string;
  rows: DataRow[];
}
export interface TreeRow {
  index: number;
  /** Short label of the parent row: the link value, else its first filled cell. */
  label: string;
  row: DataRow;
  children: TreeChild[];
}

/** Rows of a dataset with the child rows that belong to each [P-01]. */
export function buildTree(ds: {
  columns: string[];
  rows: DataRow[];
  children?: DatasetChild[] | null | undefined;
}): TreeRow[] {
  const kids = ds.children ?? [];
  return ds.rows.map((row, index) => {
    const label = row[ds.columns[0] ?? ''] || Object.values(row).find((v) => v) || `#${index + 1}`;
    return {
      index,
      label,
      row,
      children: kids.map((c) => ({
        name: c.name,
        rows: childRowsOf({ children: kids }, row, c.name) ?? [],
      })),
    };
  });
}

/** Child rows whose link matches no parent row (typos in the key) [P-01]. */
export function orphanCount(ds: {
  rows: DataRow[];
  children?: DatasetChild[] | null | undefined;
}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of ds.children ?? []) {
    const keys = new Set(ds.rows.map((r) => r[c.parentKey] ?? ''));
    const n = c.rows.filter((r) => !keys.has(r[c.key] ?? '')).length;
    if (n) out[c.name] = n;
  }
  return out;
}

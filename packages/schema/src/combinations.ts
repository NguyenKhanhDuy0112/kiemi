/**
 * Test-data combinations [P-08]: every combination of the parameters' values,
 * or a smaller "pairwise" set in which every pair of values of any two
 * parameters appears together at least once.
 */
export interface ComboParam {
  name: string;
  values: string[];
}

export type ComboRow = Record<string, string>;

/** Upper limit of rows the full product may produce. */
export const MAX_COMBINATIONS = 5000;

function clean(params: readonly ComboParam[]): ComboParam[] {
  return params
    .map((p) => ({
      name: p.name.trim(),
      values: [...new Set(p.values.map((v) => v.trim()).filter(Boolean))],
    }))
    .filter((p) => p.name && p.values.length > 0);
}

/** Size of the full product. */
export function fullCount(params: readonly ComboParam[]): number {
  return clean(params).reduce((n, p) => n * p.values.length, 1);
}

export function allCombinations(params: readonly ComboParam[]): ComboRow[] {
  const ps = clean(params);
  if (ps.length === 0) return [];
  if (fullCount(ps) > MAX_COMBINATIONS)
    throw new Error(`Too many combinations (${fullCount(ps)} > ${MAX_COMBINATIONS})`);
  let rows: ComboRow[] = [{}];
  for (const p of ps) rows = rows.flatMap((r) => p.values.map((v) => ({ ...r, [p.name]: v })));
  return rows;
}

/** Greedy pairwise set: small, deterministic, covers every pair of values. */
export function pairwiseCombinations(params: readonly ComboParam[]): ComboRow[] {
  const ps = clean(params);
  if (ps.length === 0) return [];
  if (ps.length === 1)
    return (ps[0] as ComboParam).values.map((v) => ({ [(ps[0] as ComboParam).name]: v }));
  const key = (i: number, a: number, j: number, b: number) => `${i}:${a}|${j}:${b}`;
  const uncovered = new Set<string>();
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++)
      for (let a = 0; a < (ps[i] as ComboParam).values.length; a++)
        for (let b = 0; b < (ps[j] as ComboParam).values.length; b++)
          uncovered.add(key(i, a, j, b));

  const rows: number[][] = [];
  while (uncovered.size > 0) {
    // Seed with the first uncovered pair, then fill the other parameters greedily.
    const first = uncovered.values().next().value as string;
    const [l, r] = first.split('|') as [string, string];
    const [i, a] = l.split(':').map(Number) as [number, number];
    const [j, b] = r.split(':').map(Number) as [number, number];
    const row: number[] = new Array(ps.length).fill(-1);
    row[i] = a;
    row[j] = b;
    for (let p = 0; p < ps.length; p++) {
      if (row[p] !== -1) continue;
      let best = 0;
      let bestGain = -1;
      for (let v = 0; v < (ps[p] as ComboParam).values.length; v++) {
        let g = 0;
        for (let q = 0; q < ps.length; q++) {
          if (q === p || row[q] === -1) continue;
          const [x, y] = q < p ? [q, p] : [p, q];
          const [vx, vy] = q < p ? [row[q] as number, v] : [v, row[q] as number];
          if (uncovered.has(key(x, vx, y, vy))) g++;
        }
        if (g > bestGain) {
          bestGain = g;
          best = v;
        }
      }
      row[p] = best;
    }
    for (let x = 0; x < ps.length; x++)
      for (let y = x + 1; y < ps.length; y++)
        uncovered.delete(key(x, row[x] as number, y, row[y] as number));
    rows.push(row);
  }
  return rows.map((row) =>
    Object.fromEntries(
      row.map((v, i) => [(ps[i] as ComboParam).name, (ps[i] as ComboParam).values[v] as string]),
    ),
  );
}

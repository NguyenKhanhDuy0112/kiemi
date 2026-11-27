import {
  allCombinations,
  type ComboParam,
  fullCount,
  MAX_COMBINATIONS,
  pairwiseCombinations,
} from '@kiemi/schema';

/** Lines `name: v1, v2, v3` → parameters (lines without a name or values are skipped). */
export function parseParams(text: string): ComboParam[] {
  const out: ComboParam[] = [];
  for (const line of text.split('\n')) {
    const at = line.indexOf(':');
    if (at < 1) continue;
    const name = line.slice(0, at).trim();
    const values = line
      .slice(at + 1)
      .split(/[,;]/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (name && values.length) out.push({ name, values });
  }
  return out;
}

export interface ComboPlan {
  columns: string[];
  rows: Record<string, string>[];
  full: number;
  /** `null` when the full product is too large to list. */
  tooMany: boolean;
}

export function planCombinations(text: string, mode: 'all' | 'pairwise'): ComboPlan {
  const params = parseParams(text);
  const full = fullCount(params);
  const tooMany = mode === 'all' && full > MAX_COMBINATIONS;
  const rows = tooMany
    ? []
    : mode === 'all'
      ? allCombinations(params)
      : pairwiseCombinations(params);
  return { columns: params.map((p) => p.name), rows, full, tooMany };
}

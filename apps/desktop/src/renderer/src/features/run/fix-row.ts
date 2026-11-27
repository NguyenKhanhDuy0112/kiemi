/** Cells whose value differs from the stored row. */
export function changedCells(
  stored: Record<string, string>,
  draft: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft)) if ((stored[k] ?? '') !== v) out[k] = v;
  return out;
}

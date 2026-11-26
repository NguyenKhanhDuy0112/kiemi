export interface TableDiffView {
  missing: string[];
  extra: string[];
  mismatched: { key: string; column: string; expected: string; actual: string }[];
  duplicates: string[];
}

const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/** The table comparison diff kept in a failed step's error details [P-06]. */
export function diffOf(details: unknown): TableDiffView | undefined {
  const d = (details as { diff?: Record<string, unknown> } | undefined)?.diff;
  if (!d || !strings(d.missing) || !strings(d.extra) || !Array.isArray(d.mismatched))
    return undefined;
  const mismatched = d.mismatched.filter(
    (m): m is TableDiffView['mismatched'][number] =>
      !!m &&
      typeof m === 'object' &&
      ['key', 'column', 'expected', 'actual'].every(
        (k) => typeof (m as Record<string, unknown>)[k] === 'string',
      ),
  );
  return {
    missing: d.missing,
    extra: d.extra,
    mismatched,
    duplicates: strings(d.duplicates) ? d.duplicates : [],
  };
}

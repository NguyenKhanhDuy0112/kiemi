/** One noted value compared between two runs [V-06]. */
export interface ObservationDiff {
  name: string;
  a?: string | undefined;
  b?: string | undefined;
  status: 'same' | 'different' | 'onlyA' | 'onlyB';
}

/**
 * Compares the `observe` values of two runs (e.g. UAT vs Staging): which noted
 * fields differ, or exist on one side only. Different fields come first.
 */
export function compareObservations(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): ObservationDiff[] {
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const rank = { different: 0, onlyA: 1, onlyB: 2, same: 3 } as const;
  return names
    .map((name): ObservationDiff => {
      const inA = Object.hasOwn(a, name);
      const inB = Object.hasOwn(b, name);
      const status = !inB ? 'onlyA' : !inA ? 'onlyB' : a[name] === b[name] ? 'same' : 'different';
      return { name, a: a[name], b: b[name], status };
    })
    .sort((x, y) => rank[x.status] - rank[y.status]);
}

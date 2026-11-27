/**
 * Hierarchical dashboard maths [O-10]: one flat row per executed case, grouped
 * by any level (project / product / environment). Pure, no I/O.
 */

export interface DashRow {
  runId: string;
  projectId: string;
  productId: string | null;
  environmentId: string | null;
  testCaseId: string;
  status: string;
  /** Run start (epoch ms). */
  at: number;
  /** How long the case took, when known [T-07]. */
  durationMs?: number | undefined;
}

export interface DashTrendPoint {
  /** `YYYY-MM-DD` (local day). */
  day: string;
  passRate: number;
  total: number;
}

export interface DashStats {
  runs: number;
  cases: number;
  passed: number;
  failed: number;
  /** passed / (passed + failed + error); `null` when nothing counted. */
  passRate: number | null;
  lastRunAt: number | null;
  lastRunId: string | null;
  /** Tests whose latest result is failed/error. */
  failingTests: string[];
  trend: DashTrendPoint[];
}

const isFail = (s: string) => s === 'failed' || s === 'error';
const counted = (s: string) => s === 'passed' || isFail(s);

const dayKey = (at: number) => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Stats of a set of rows; trend = last `days` days that had results. */
export function statsOf(rows: readonly DashRow[], days = 14): DashStats {
  const runIds = new Set<string>();
  let passed = 0;
  let failed = 0;
  let cases = 0;
  const latest = new Map<string, DashRow>();
  const byDay = new Map<string, { p: number; t: number }>();
  let last: DashRow | null = null;
  for (const r of rows) {
    runIds.add(r.runId);
    if (!last || r.at > last.at) last = r;
    if (!counted(r.status)) continue;
    cases++;
    if (r.status === 'passed') passed++;
    else failed++;
    const prev = latest.get(r.testCaseId);
    if (!prev || r.at >= prev.at) latest.set(r.testCaseId, r);
    const k = dayKey(r.at);
    const d = byDay.get(k) ?? { p: 0, t: 0 };
    d.t++;
    if (r.status === 'passed') d.p++;
    byDay.set(k, d);
  }
  const trend = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-days)
    .map(([day, d]) => ({ day, passRate: d.p / d.t, total: d.t }));
  return {
    runs: runIds.size,
    cases,
    passed,
    failed,
    passRate: cases ? passed / cases : null,
    lastRunAt: last?.at ?? null,
    lastRunId: last?.runId ?? null,
    failingTests: [...latest.values()].filter((r) => isFail(r.status)).map((r) => r.testCaseId),
    trend,
  };
}

/** Group rows by a key and compute stats per group; groups sorted worst pass rate first. */
export function groupStats(
  rows: readonly DashRow[],
  keyOf: (r: DashRow) => string | null,
): { key: string; stats: DashStats }[] {
  const groups = new Map<string, DashRow[]>();
  for (const r of rows) {
    const k = keyOf(r) ?? '';
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, stats: statsOf(g) }))
    .sort((a, b) => (a.stats.passRate ?? 2) - (b.stats.passRate ?? 2));
}

export interface FlakyTest {
  testCaseId: string;
  /** Pass ↔ fail changes in the last results. */
  flips: number;
  results: number;
}

const WINDOW = 10;

/**
 * Tests that pass and fail without a change in between: at least 2 flips
 * between pass and fail in their last 10 results [T-07].
 */
export function flakyTests(rows: readonly DashRow[], minFlips = 2): FlakyTest[] {
  const byTest = new Map<string, DashRow[]>();
  for (const r of rows) {
    if (!counted(r.status)) continue;
    byTest.set(r.testCaseId, [...(byTest.get(r.testCaseId) ?? []), r]);
  }
  const out: FlakyTest[] = [];
  for (const [testCaseId, list] of byTest) {
    const last = list.sort((a, b) => a.at - b.at).slice(-WINDOW);
    let flips = 0;
    for (let i = 1; i < last.length; i++)
      if (isFail((last[i] as DashRow).status) !== isFail((last[i - 1] as DashRow).status)) flips++;
    if (flips >= minFlips) out.push({ testCaseId, flips, results: last.length });
  }
  return out.sort((a, b) => b.flips - a.flips);
}

export interface SlowTest {
  testCaseId: string;
  avgMs: number;
  runs: number;
}

/** The `limit` tests with the longest average duration [T-07]. */
export function slowestTests(rows: readonly DashRow[], limit = 5): SlowTest[] {
  const sum = new Map<string, { total: number; n: number }>();
  for (const r of rows) {
    if (r.durationMs === undefined || !counted(r.status)) continue;
    const s = sum.get(r.testCaseId) ?? { total: 0, n: 0 };
    s.total += r.durationMs;
    s.n++;
    sum.set(r.testCaseId, s);
  }
  return [...sum]
    .map(([testCaseId, s]) => ({ testCaseId, avgMs: Math.round(s.total / s.n), runs: s.n }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, limit);
}

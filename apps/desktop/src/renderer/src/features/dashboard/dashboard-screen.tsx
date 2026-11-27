import { EmptyState } from '@renderer/components/empty-state';
import { Button } from '@renderer/components/ui/button';
import { useAppStore } from '@renderer/lib/store';
import { trpc } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { formatPercent, formatWhen, rateTone } from './format';

interface Scope {
  /** `null` = whole workspace. */
  projectId: string | null;
  productId?: string;
  productName?: string;
}

interface Stats {
  runs: number;
  cases: number;
  passRate: number | null;
  lastRunAt: number | null;
  lastRunId: string | null;
  trend: { day: string; passRate: number; total: number }[];
}

function Trend({ points }: { points: Stats['trend'] }) {
  const tx = useTx();
  return (
    <div className="flex h-10 items-end gap-0.5" role="img" aria-label={tx('ui.dashboard.trend')}>
      {points.map((p) => (
        <div
          key={p.day}
          title={`${p.day}: ${formatPercent(p.passRate)} (${p.total})`}
          className={`w-2 rounded-sm ${rateTone(p.passRate).bar}`}
          style={{ height: `${Math.max(8, p.passRate * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Dashboard by level: workspace → project → product → environment [O-10]. */
export function DashboardScreen() {
  const tx = useTx();
  const current = useAppStore((s) => s.projectId);
  const openRun = useAppStore((s) => s.openRun);
  const [scope, setScope] = useState<Scope>({ projectId: current });
  const projectId = scope.projectId ?? undefined;
  const data = useQuery({
    ...trpc.dashboard.overview.queryOptions({
      ...(projectId ? { projectId } : {}),
      ...(scope.productId !== undefined ? { productId: scope.productId } : {}),
    }),
    refetchInterval: 10000,
  });
  const d = data.data;
  const drillTo = (key: string, name: string) => {
    if (!d) return;
    if (d.level === 'workspace') setScope({ projectId: key });
    else if (d.level === 'project')
      setScope({ projectId: scope.projectId, productId: key, productName: name });
  };
  const levelLabel = d
    ? tx(
        d.level === 'workspace'
          ? 'ui.dashboard.levelWorkspace'
          : d.level === 'project'
            ? 'ui.dashboard.levelProject'
            : 'ui.dashboard.levelProduct',
      )
    : '';

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="dashboard-screen"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <LayoutDashboard className="size-5 text-muted-foreground" aria-hidden />
          {tx('ui.dashboard.title')}
        </h1>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={() => setScope({ projectId: null })}>
            {tx('ui.dashboard.workspace')}
          </Button>
          {scope.projectId && (
            <>
              <ChevronRight className="size-4" aria-hidden />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setScope({ projectId: scope.projectId })}
              >
                {tx('ui.dashboard.levelProject')}
              </Button>
            </>
          )}
          {scope.productId !== undefined && (
            <>
              <ChevronRight className="size-4" aria-hidden />
              <span className="px-2">{scope.productName || tx('ui.dashboard.noProduct')}</span>
            </>
          )}
        </nav>
      </header>

      {!d || d.total.cases === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title={tx('ui.dashboard.title')}
          text={tx('ui.dashboard.empty')}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="dashboard-total">
            <Tile label={tx('ui.dashboard.passRate')} value={formatPercent(d.total.passRate)} />
            <Tile label={tx('ui.dashboard.runs')} value={String(d.total.runs)} />
            <Tile label={tx('ui.dashboard.cases')} value={String(d.total.cases)} />
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{tx('ui.dashboard.trend')}</div>
              <Trend points={d.total.trend} />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium">{levelLabel}</h2>
            <ul className="divide-y rounded-md border" data-testid="dashboard-groups">
              {d.groups.map((g) => {
                const name =
                  g.name ||
                  tx(
                    d.level === 'project' ? 'ui.dashboard.noProduct' : 'ui.dashboard.noEnvironment',
                  );
                const drillable = d.level !== 'product';
                return (
                  <GroupRow
                    key={g.key}
                    name={name}
                    stats={g.stats}
                    onOpen={drillable ? () => drillTo(g.key, g.name) : undefined}
                    onOpenRun={openRun}
                  />
                );
              })}
            </ul>
          </section>

          {d.level !== 'workspace' && (
            <section>
              <h2 className="mb-2 text-sm font-medium">{tx('ui.dashboard.failing')}</h2>
              {d.failing.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tx('ui.dashboard.noFailing')}</p>
              ) : (
                <ul className="list-disc pl-5 text-sm">
                  {d.failing.map((f) => (
                    <li key={f.id}>{f.name}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function GroupRow({
  name,
  stats,
  onOpen,
  onOpenRun,
}: {
  name: string;
  stats: Stats;
  onOpen: (() => void) | undefined;
  onOpenRun: (id: string) => void;
}) {
  const tx = useTx();
  const tone = rateTone(stats.passRate);
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <button
        type="button"
        disabled={!onOpen}
        onClick={onOpen}
        className="min-w-0 flex-1 truncate text-left font-medium enabled:hover:underline"
      >
        {name}
      </button>
      <span className={`w-16 text-right font-semibold ${tone.text}`}>
        {formatPercent(stats.passRate)}
      </span>
      <span className="w-40 text-xs text-muted-foreground">
        {tx('ui.dashboard.lastRun')}:{' '}
        {stats.lastRunAt ? formatWhen(stats.lastRunAt) : tx('ui.dashboard.never')}
      </span>
      <Trend points={stats.trend} />
      {stats.lastRunId && (
        <Button variant="ghost" size="sm" onClick={() => onOpenRun(stats.lastRunId as string)}>
          {tx('ui.dashboard.openRun')}
        </Button>
      )}
    </li>
  );
}

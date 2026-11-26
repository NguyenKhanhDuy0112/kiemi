import {
  applyRun,
  countsByAssignee,
  type ManualCase,
  type PlanStatus,
  planCounts,
  planHeadline,
  planProgress,
  syncManual,
  type TestPlan,
} from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Textarea } from '@renderer/components/ui/textarea';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Copy, ListPlus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { addItems, assignUnowned, itemName, newPlan, PLAN_STATUSES, patchItem } from './plan-edit';

const TONE: Record<PlanStatus, string> = {
  notrun: 'bg-muted text-muted-foreground',
  pass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  fail: 'bg-red-500/15 text-red-700 dark:text-red-400',
  blocked: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

/** "Đợt test": a round per release — who runs what, and how it went [T-02]. */
export function PlansScreen() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const stored = project.data?.testPlans;
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setPlans(stored ?? []), [stored]);
  const dirty = JSON.stringify(plans) !== JSON.stringify(stored ?? []);
  const current = plans.find((p) => p.id === selected) ?? null;

  const change = (p: TestPlan) => setPlans((all) => all.map((x) => (x.id === p.id ? p : x)));
  const save = async () => {
    try {
      await trpcClient.projects.setTestPlans.mutate({ id: projectId, plans });
      await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-testid="plans-screen">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck className="size-5 text-muted-foreground" aria-hidden />
          {tx('ui.plans.title')}
        </h1>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const p = newPlan(tx('ui.plans.newName'));
              setPlans((all) => [...all, p]);
              setSelected(p.id);
            }}
          >
            <Plus /> {tx('ui.plans.add')}
          </Button>
          <Button size="sm" disabled={!dirty} onClick={() => void save()}>
            {tx('ui.actions.save')}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-4">
        <ul
          className="w-64 shrink-0 overflow-auto rounded-md border"
          aria-label={tx('ui.plans.title')}
        >
          {plans.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">{tx('ui.plans.empty')}</li>
          )}
          {plans.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelected(p.id)}
                className={`flex w-full flex-col gap-1 px-3 py-2 text-left text-sm hover:bg-accent ${p.id === selected ? 'bg-accent' : ''}`}
              >
                <span className="truncate font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {tx('ui.plans.progress', { percent: planProgress(p), total: p.items.length })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 flex-1 overflow-auto">
          {current ? (
            <PlanEditor
              key={current.id}
              plan={current}
              onChange={change}
              onRemove={() => {
                setPlans((all) => all.filter((x) => x.id !== current.id));
                setSelected(null);
              }}
              manual={project.data?.manualCases ?? []}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{tx('ui.plans.pick')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanEditor({
  plan,
  onChange,
  onRemove,
  manual,
}: {
  plan: TestPlan;
  onChange: (p: TestPlan) => void;
  onRemove: () => void;
  manual: ManualCase[];
}) {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const tests = useQuery(trpc.testCases.list.queryOptions({ projectId }));
  const runs = useQuery(trpc.runs.history.queryOptions({ projectId, limit: 20 }));
  const names = new Map((tests.data ?? []).map((t) => [t.id, t.name]));
  const [picker, setPicker] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [who, setWho] = useState('');
  const counts = planCounts(plan.items);
  const byPerson = Object.entries(countsByAssignee(plan));

  const toggle = (key: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (!n.delete(key)) n.add(key);
      return n;
    });
  const addPicked = () => {
    const picks = [
      ...(tests.data ?? [])
        .filter((t) => checked.has(`auto:${t.id}`))
        .map((t) => ({ kind: 'auto' as const, refId: t.id, name: t.name })),
      ...manual
        .filter((c) => checked.has(`manual:${c.id}`))
        .map((c) => ({ kind: 'manual' as const, refId: c.id, name: c.name })),
    ];
    onChange(addItems(plan, picks));
    setChecked(new Set());
    setPicker(false);
  };
  const fromRun = async (runId: string) => {
    try {
      const run = await trpcClient.runs.get.query({ runId });
      onChange(applyRun(plan, runId, run.cases));
      toast.success(tx('ui.plans.runApplied'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const copyHeadline = async () => {
    await navigator.clipboard.writeText(planHeadline(plan));
    toast.success(tx('ui.plans.copied'));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={plan.name}
          aria-label={tx('ui.plans.name')}
          onChange={(e) => onChange({ ...plan, name: e.target.value })}
        />
        <Input
          className="w-40"
          value={plan.release}
          placeholder={tx('ui.plans.release')}
          aria-label={tx('ui.plans.release')}
          onChange={(e) => onChange({ ...plan, release: e.target.value })}
        />
      </div>

      <section className="rounded-md border p-3" aria-label={tx('ui.plans.dashboard')}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium" data-testid="plan-headline">
            {planHeadline(plan)}
          </p>
          <Button
            size="icon"
            variant="ghost"
            aria-label={tx('ui.plans.copy')}
            onClick={() => void copyHeadline()}
          >
            <Copy />
          </Button>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded bg-muted" aria-hidden>
          {counts.total > 0 && (
            <>
              <span
                className="bg-emerald-500"
                style={{ width: `${(counts.pass / counts.total) * 100}%` }}
              />
              <span
                className="bg-red-500"
                style={{ width: `${(counts.fail / counts.total) * 100}%` }}
              />
              <span
                className="bg-amber-500"
                style={{ width: `${(counts.blocked / counts.total) * 100}%` }}
              />
            </>
          )}
        </div>
        {byPerson.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="font-normal">{tx('ui.plans.assignee')}</th>
                {PLAN_STATUSES.map((s) => (
                  <th key={s} className="font-normal">
                    {tx(`ui.plans.status.${s}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byPerson.map(([person, c]) => (
                <tr key={person}>
                  <td>{person || tx('ui.plans.nobody')}</td>
                  {PLAN_STATUSES.map((s) => (
                    <td key={s}>{c[s]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setPicker((v) => !v)}>
          <ListPlus /> {tx('ui.plans.addTests')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onChange(syncManual(plan, manual))}>
          <RefreshCw /> {tx('ui.plans.syncManual')}
        </Button>
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          aria-label={tx('ui.plans.fromRun')}
          value=""
          onChange={(e) => e.target.value && void fromRun(e.target.value)}
        >
          <option value="">{tx('ui.plans.fromRun')}</option>
          {(runs.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {new Date(r.createdAt).toLocaleString()} · {r.status}
            </option>
          ))}
        </select>
        <Input
          className="h-8 w-36"
          value={who}
          placeholder={tx('ui.plans.assignee')}
          aria-label={tx('ui.plans.assignee')}
          onChange={(e) => setWho(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!who.trim()}
          onClick={() => onChange(assignUnowned(plan, who.trim()))}
        >
          {tx('ui.plans.assignRest')}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={onRemove}>
          <Trash2 /> {tx('ui.plans.remove')}
        </Button>
      </div>

      {picker && (
        <div
          className="max-h-56 overflow-auto rounded-md border p-2 text-sm"
          data-testid="plan-picker"
        >
          {(tests.data ?? []).map((t) => (
            <label key={t.id} className="flex items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={checked.has(`auto:${t.id}`)}
                onChange={() => toggle(`auto:${t.id}`)}
              />
              {t.name}
            </label>
          ))}
          {manual.map((c) => (
            <label key={c.id} className="flex items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={checked.has(`manual:${c.id}`)}
                onChange={() => toggle(`manual:${c.id}`)}
              />
              {c.name}{' '}
              <span className="text-xs text-muted-foreground">({tx('ui.plans.manualTag')})</span>
            </label>
          ))}
          <Button size="sm" className="mt-2" disabled={checked.size === 0} onClick={addPicked}>
            {tx('ui.plans.addPicked', { count: checked.size })}
          </Button>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {plan.items.map((it) => (
          <li key={it.id} className="flex flex-col gap-2 rounded-md border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                {itemName(it, names, manual)}{' '}
                <span className="text-xs text-muted-foreground">
                  ({tx(it.kind === 'auto' ? 'ui.plans.autoTag' : 'ui.plans.manualTag')})
                </span>
              </span>
              <Input
                className="h-8 w-32"
                value={it.assignee}
                placeholder={tx('ui.plans.assignee')}
                aria-label={tx('ui.plans.assignee')}
                onChange={(e) => onChange(patchItem(plan, it.id, { assignee: e.target.value }))}
              />
              <select
                className={`h-8 rounded-md border px-2 text-sm ${TONE[it.status]}`}
                aria-label={tx('ui.plans.result')}
                value={it.status}
                onChange={(e) =>
                  onChange(patchItem(plan, it.id, { status: e.target.value as PlanStatus }))
                }
              >
                {PLAN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tx(`ui.plans.status.${s}`)}
                  </option>
                ))}
              </select>
              <Button
                size="icon"
                variant="ghost"
                aria-label={tx('ui.plans.removeItem')}
                onClick={() =>
                  onChange({ ...plan, items: plan.items.filter((x) => x.id !== it.id) })
                }
              >
                <Trash2 />
              </Button>
            </div>
            {(it.status === 'fail' || it.status === 'blocked' || it.note) && (
              <Textarea
                rows={1}
                value={it.note}
                placeholder={tx('ui.plans.note')}
                aria-label={tx('ui.plans.note')}
                onChange={(e) => onChange(patchItem(plan, it.id, { note: e.target.value }))}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

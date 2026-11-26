import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Textarea } from '@renderer/components/ui/textarea';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus, Sigma, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type FormulaRow, fromRows, newRow, splitParams, toRows } from './formula-edit';

interface Trial {
  ok: boolean;
  value?: string;
  error?: string;
  steps?: { text: string; value: string; depth: number }[];
}

/** "Công thức": named formulas shared by every test of the project, with a try-out box [P-03]. */
export function FormulasScreen() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const stored = project.data?.formulas;
  const [rows, setRows] = useState<FormulaRow[]>([]);
  useEffect(() => setRows(toRows(stored ?? {})), [stored]);
  const parsed = fromRows(rows);
  const dirty = parsed.ok && JSON.stringify(parsed.formulas) !== JSON.stringify(stored ?? {});
  const patch = (key: string, p: Partial<FormulaRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const save = async () => {
    if (!parsed.ok) return;
    try {
      await trpcClient.projects.setFormulas.mutate({ id: projectId, formulas: parsed.formulas });
      await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="formulas-screen"
    >
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Sigma className="size-5 text-muted-foreground" aria-hidden />
          {tx('ui.formulas.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tx('ui.formulas.hint', { example: '{{TongDon(gioHang, 0)}}' })}
        </p>
      </header>

      {rows.map((r) => (
        <FormulaCard
          key={r.key}
          row={r}
          all={parsed.ok ? parsed.formulas : {}}
          onChange={(p) => patch(r.key, p)}
          onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
        />
      ))}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}>
          <Plus /> {tx('ui.formulas.add')}
        </Button>
        <Button size="sm" disabled={!dirty} onClick={() => void save()}>
          {tx('ui.formulas.save')}
        </Button>
        {!parsed.ok && (
          <span className="text-sm text-destructive" role="alert">
            {tx('ui.formulas.invalid', { reason: parsed.error })}
          </span>
        )}
      </div>
    </div>
  );
}

function FormulaCard({
  row,
  all,
  onChange,
  onRemove,
}: {
  row: FormulaRow;
  all: Record<string, { params: string[]; expression: string }>;
  onChange: (p: Partial<FormulaRow>) => void;
  onRemove: () => void;
}) {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [trial, setTrial] = useState<Trial | null>(null);
  const params = splitParams(row.params);

  const run = async () => {
    try {
      const call = `${row.name.trim()}(${params.join(', ')})`;
      setTrial(
        await trpcClient.formulas.explain.mutate({
          expression: call,
          formulas: { ...all, [row.name.trim()]: { params, expression: row.expression } },
          values,
        }),
      );
    } catch (err) {
      setTrial({ ok: false, error: errorMessage(err, tx) });
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4" data-testid="formula-card">
      <div className="grid items-center gap-2 md:grid-cols-12">
        <Input
          className="md:col-span-3"
          aria-label={tx('ui.formulas.name')}
          placeholder={tx('ui.formulas.name')}
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <Input
          className="md:col-span-8"
          aria-label={tx('ui.formulas.params')}
          placeholder={tx('ui.formulas.params')}
          value={row.params}
          onChange={(e) => onChange({ params: e.target.value })}
        />
        <Button
          variant="ghost"
          size="icon"
          className="md:col-span-1"
          aria-label={tx('ui.actions.delete')}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      <Textarea
        aria-label={tx('ui.formulas.expression')}
        placeholder={tx('ui.formulas.expression')}
        className="font-mono text-sm"
        value={row.expression}
        onChange={(e) => onChange({ expression: e.target.value })}
      />
      <Input
        aria-label={tx('ui.formulas.description')}
        placeholder={tx('ui.formulas.description')}
        value={row.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <div>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          <FlaskConical /> {tx('ui.formulas.try')}
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">{tx('ui.formulas.tryHint')}</p>
          {params.map((p) => (
            <div key={p} className="grid items-center gap-2 md:grid-cols-12">
              <span className="font-mono text-sm md:col-span-2">{p}</span>
              <Input
                className="font-mono md:col-span-10"
                aria-label={p}
                value={values[p] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <Button size="sm" onClick={() => void run()}>
              {tx('ui.formulas.calculate')}
            </Button>
          </div>
          {trial?.ok === false && (
            <p className="text-sm text-destructive" role="alert">
              {trial.error}
            </p>
          )}
          {trial?.ok && (
            <div data-testid="formula-trace">
              <ol className="font-mono text-xs">
                {trial.steps?.map((s, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: steps are positional.
                  <li key={i} style={{ paddingLeft: `${s.depth * 12}px` }}>
                    {s.text} = <strong>{s.value}</strong>
                  </li>
                ))}
              </ol>
              <p className="mt-1 text-sm">
                {tx('ui.formulas.result')}: <strong>{trial.value}</strong>
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

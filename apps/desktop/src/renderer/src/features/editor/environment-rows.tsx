import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type Rows = Record<string, string>[];

/** Own rows of a saved dataset on one environment [O-05]. */
export function EnvironmentRows({ datasetId }: { datasetId: string }) {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const envs = useQuery({
    ...trpc.environments.list.queryOptions({ projectId }),
    enabled: !!projectId,
  });
  const ds = useQuery(trpc.datasets.get.queryOptions({ id: datasetId }));
  const [envId, setEnvId] = useState<string | null>(null);
  const current = envId ?? envs.data?.[0]?.id ?? null;
  const own = current ? ds.data?.envRows?.[current] : undefined;
  const [rows, setRows] = useState<Rows | null>(null);
  useEffect(() => setRows(own ? own.map((r) => ({ ...r })) : null), [own]);
  if (!ds.data || !envs.data?.length || !current) return null;
  const columns = ds.data.columns;
  const envName = envs.data.find((e) => e.id === current)?.name ?? '';
  const save = async (next: Rows | null) => {
    try {
      await trpcClient.datasets.setEnvironmentRows.mutate({
        id: datasetId,
        environmentId: current,
        rows: next,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: trpc.datasets.get.queryKey({ id: datasetId }) }),
        qc.invalidateQueries({ queryKey: trpc.datasets.list.queryKey({ projectId }) }),
      ]);
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border p-3"
      aria-label={tx('ui.data.envRows')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Globe className="size-4 text-muted-foreground" aria-hidden />
          {tx('ui.data.envRows')}
        </h3>
        <Select value={current} onValueChange={setEnvId}>
          <SelectTrigger className="ml-auto h-8 w-52" aria-label={tx('ui.data.envPick')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {envs.data.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{tx('ui.data.envRowsHint')}</p>
      {rows === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{tx('ui.data.usesDefault', { name: envName })}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRows(ds.data.rows.map((r) => ({ ...r })))}
          >
            {tx('ui.data.makeOwn', { name: envName })}
          </Button>
        </div>
      ) : (
        <>
          {own && (
            <span className="text-sm">
              {tx('ui.data.usesOwn', { name: envName, count: own.length })}
            </span>
          )}
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  {columns.map((c) => (
                    <th key={c} className="p-1.5 text-left font-medium">
                      {c}
                    </th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional.
                  <tr key={ri} className="border-t">
                    {columns.map((c) => (
                      <td key={c} className="p-1">
                        <Input
                          className="h-8"
                          aria-label={c}
                          value={r[c] ?? ''}
                          onChange={(e) =>
                            setRows(
                              rows.map((x, i) => (i === ri ? { ...x, [c]: e.target.value } : x)),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={tx('ui.actions.delete')}
                        onClick={() => setRows(rows.filter((_, i) => i !== ri))}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRows([...rows, Object.fromEntries(columns.map((c) => [c, '']))])}
            >
              <Plus /> {tx('ui.data.addRow')}
            </Button>
            <Button size="sm" onClick={() => void save(rows)}>
              {tx('ui.data.saveRows')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void (own ? save(null) : setRows(null))}
            >
              {tx('ui.data.backToDefault')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

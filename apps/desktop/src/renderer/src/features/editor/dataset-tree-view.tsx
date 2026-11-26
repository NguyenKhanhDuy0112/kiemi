import type { DatasetChild } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { errorMessage } from '@renderer/lib/errors';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { buildTree, orphanCount } from './dataset-tree';

/** Tree view of a dataset with linked child tables + the key columns [P-01]. */
export function DatasetTree({ datasetId }: { datasetId: string }) {
  const tx = useTx();
  const qc = useQueryClient();
  const ds = useQuery(trpc.datasets.get.queryOptions({ id: datasetId }));
  const [open, setOpen] = useState<Set<number>>(new Set());
  const data = ds.data;
  if (!data?.children?.length) return null;
  const orphans = orphanCount(data);

  const relink = async (name: string, patch: Partial<Pick<DatasetChild, 'key' | 'parentKey'>>) => {
    const children = (data.children ?? []).map((c) => (c.name === name ? { ...c, ...patch } : c));
    try {
      await trpcClient.datasets.update.mutate({ id: datasetId, patch: { children } });
      await qc.invalidateQueries({ queryKey: trpc.datasets.get.queryKey({ id: datasetId }) });
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <section className="flex flex-col gap-2" aria-label={tx('ui.data.tree.title')}>
      <h3 className="text-sm font-medium">{tx('ui.data.tree.title')}</h3>
      {data.children.map((c) => (
        <div key={c.name} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{c.name}</span>
          <span className="text-muted-foreground">{tx('ui.data.tree.linkedBy')}</span>
          <Select value={c.key} onValueChange={(key) => void relink(c.name, { key })}>
            <SelectTrigger className="h-8 w-40" aria-label={tx('ui.data.tree.childKey')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {c.columns.map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span aria-hidden>↔</span>
          <Select
            value={c.parentKey}
            onValueChange={(parentKey) => void relink(c.name, { parentKey })}
          >
            <SelectTrigger className="h-8 w-40" aria-label={tx('ui.data.tree.parentKey')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.columns.map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {orphans[c.name] ? (
            <span className="text-amber-600">
              {tx('ui.data.tree.orphans', { count: orphans[c.name] ?? 0 })}
            </span>
          ) : null}
        </div>
      ))}
      <ul className="rounded-md border text-sm">
        {buildTree(data).map((r) => (
          <li key={r.index} className="border-b last:border-b-0">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-1 rounded-none"
              aria-expanded={open.has(r.index)}
              onClick={() =>
                setOpen((s) => {
                  const n = new Set(s);
                  if (!n.delete(r.index)) n.add(r.index);
                  return n;
                })
              }
            >
              {open.has(r.index) ? <ChevronDown /> : <ChevronRight />}
              <span className="font-medium">{r.label}</span>
              <span className="text-muted-foreground">
                {r.children.map((c) => `${c.name}: ${c.rows.length}`).join(' · ')}
              </span>
            </Button>
            {open.has(r.index) &&
              r.children.map((c) => (
                <div key={c.name} className="overflow-auto px-6 pb-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        {(data.children?.find((x) => x.name === c.name)?.columns ?? []).map((h) => (
                          <th key={h} className="p-1 font-normal">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.rows.map((row, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional.
                        <tr key={i} className="border-t">
                          {(data.children?.find((x) => x.name === c.name)?.columns ?? []).map(
                            (h) => (
                              <td key={h} className="p-1">
                                {row[h]}
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

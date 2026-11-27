import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { errorMessage } from '@renderer/lib/errors';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { changedCells } from './fix-row';

/**
 * Data row of the waiting case: fix the wrong cell here; the run retries with it
 * and the test's data (table or saved dataset) is updated too [FX-10].
 */
export function FixRowPanel({ runId, runCaseId }: { runId: string; runCaseId: string }) {
  const tx = useTx();
  const qc = useQueryClient();
  const data = useQuery(trpc.runs.rowOf.queryOptions({ runId, runCaseId }));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const stored = data.data?.row;
  useEffect(() => {
    if (stored) setDraft(stored);
  }, [stored]);
  if (!data.data) return null;
  const changed = changedCells(data.data.row, draft);

  const save = async () => {
    try {
      await trpcClient.runs.saveRow.mutate({ runId, runCaseId, values: changed });
      await qc.invalidateQueries({ queryKey: trpc.runs.rowOf.queryKey({ runId, runCaseId }) });
      await qc.invalidateQueries({ queryKey: trpc.testCases.get.queryKey() });
      await qc.invalidateQueries({ queryKey: trpc.datasets.list.queryKey() });
      toast.success(tx('ui.run.rowSaved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <fieldset className="flex flex-col gap-2 border-t px-4 py-3 text-xs" data-testid="fix-row">
      <legend className="sr-only">{tx('ui.run.rowTitle', { row: data.data.rowIndex + 1 })}</legend>
      <p className="font-medium">{tx('ui.run.rowTitle', { row: data.data.rowIndex + 1 })}</p>
      {data.data.columns.map((col) => (
        <div key={col} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-muted-foreground" title={col}>
            {col}
          </span>
          <Input
            className="h-8"
            aria-label={col}
            value={draft[col] ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, [col]: e.target.value }))}
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={Object.keys(changed).length === 0}
        onClick={() => void save()}
      >
        {tx('ui.run.rowApply')}
      </Button>
    </fieldset>
  );
}

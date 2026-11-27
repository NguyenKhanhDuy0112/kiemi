import type { TestCase } from '@kiemi/schema';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Label } from '@renderer/components/ui/label';
import { Switch } from '@renderer/components/ui/switch';
import { trpc } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { cn } from '@renderer/lib/utils';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { stepText } from '../editor/describe';
import { findStep } from '../editor/doc-model';
import { RunStatusBadge } from '../run/run-screen';
import { fromDetail } from '../run/run-state';
import { StatusIcon } from '../run/step-status';
import { compareRuns } from './compare';

const when = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('vi-VN') : '';

/** Two runs side by side; older on the left [S-05]. */
export function CompareDialog({ a, b, onClose }: { a: string; b: string; onClose: () => void }) {
  const tx = useTx();
  const [older, newer] = a < b ? [a, b] : [b, a];
  const ra = useQuery(trpc.runs.get.queryOptions({ runId: older }));
  const rb = useQuery(trpc.runs.get.queryOptions({ runId: newer }));
  const [onlyChanges, setOnlyChanges] = useState(true);
  const rows = useMemo(
    () => (ra.data && rb.data ? compareRuns(fromDetail(ra.data), fromDetail(rb.data)) : []),
    [ra.data, rb.data],
  );
  const ids = [...new Set(rows.map((r) => r.testCaseId))];
  const tests = useQueries({
    queries: ids.map((id) => ({ ...trpc.testCases.get.queryOptions({ id }), retry: false })),
  });
  const docs: Record<string, TestCase | undefined> = {};
  ids.forEach((id, i) => {
    docs[id] = tests[i]?.data?.content;
  });
  const shown = onlyChanges ? rows.filter((r) => r.changed) : rows;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{tx('ui.history.compareTitle')}</DialogTitle>
          <DialogDescription>
            {when(ra.data?.startedAt)} ↔ {when(rb.data?.startedAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Switch id="cmp-only" checked={onlyChanges} onCheckedChange={setOnlyChanges} />
          <Label htmlFor="cmp-only">{tx('ui.history.onlyChanges')}</Label>
        </div>
        {!ra.data || !rb.data ? (
          <Loader2 className="mx-auto animate-spin" />
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {tx('ui.history.noChanges')}
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            {shown.map((c) => {
              const doc = docs[c.testCaseId];
              const steps = onlyChanges ? c.steps.filter((s) => s.changed) : c.steps;
              return (
                <section key={c.key} className="mb-4 rounded-lg border">
                  <h3 className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
                    <span className="flex-1">
                      {c.testName}
                      {c.rowIndex !== undefined &&
                        ` · ${tx('ui.run.row', { row: c.rowIndex + 1 })}`}
                    </span>
                    {c.a ? <RunStatusBadge status={c.a} /> : tx('ui.history.notRun')}
                    <span aria-hidden>→</span>
                    {c.b ? <RunStatusBadge status={c.b} /> : tx('ui.history.notRun')}
                  </h3>
                  {c.fields.length > 0 && (
                    <table className="w-full border-b text-sm" data-testid="compare-fields">
                      <caption className="px-3 py-1 text-left text-xs font-medium text-muted-foreground">
                        {tx('ui.history.fieldsDiffer', { count: c.fields.length })}
                      </caption>
                      <tbody>
                        {c.fields.map((f) => (
                          <tr key={f.name} className="bg-warning/10">
                            <td className="px-3 py-1 font-medium">{f.name}</td>
                            <td className="px-3 py-1">{f.a ?? tx('ui.history.missing')}</td>
                            <td aria-hidden>→</td>
                            <td className="px-3 py-1">{f.b ?? tx('ui.history.missing')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <ul>
                    {steps.map((s) => {
                      const step = doc ? findStep(doc, s.stepId) : undefined;
                      return (
                        <li
                          key={s.stepId}
                          className={cn(
                            'flex items-center gap-2 border-b px-3 py-1.5 text-sm last:border-b-0',
                            s.changed && 'bg-warning/10',
                          )}
                        >
                          <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                            {s.stepNo}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {step && doc
                              ? stepText(step, doc.elements, tx)
                              : tx('ui.run.stepMissing')}
                          </span>
                          <StatusIcon status={s.a} />
                          <span aria-hidden>→</span>
                          <StatusIcon status={s.b} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

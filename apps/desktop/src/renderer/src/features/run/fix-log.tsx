import { Button } from '@renderer/components/ui/button';
import { errorMessage } from '@renderer/lib/errors';
import { useTx } from '@renderer/lib/tx';
import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { undoLastFix, useRunFixes } from './run-fixes';

/** What was changed while fixing this run, newest last; the last change can be undone [FX-11]. */
export function FixLog({ runId, className }: { runId: string; className?: string }) {
  const tx = useTx();
  const entries = useRunFixes((s) => s.byRun[runId]);
  const [busy, setBusy] = useState(false);
  if (!entries?.length) return null;
  const undo = async () => {
    setBusy(true);
    try {
      const e = await undoLastFix(runId);
      if (e) toast.success(tx('ui.run.undone', { label: e.label }));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={className} aria-label={tx('ui.run.fixLog')}>
      <p className="mb-1 text-xs font-medium">{tx('ui.run.fixLog')}</p>
      <ol className="flex flex-col gap-1 text-xs">
        {entries.map((e, i) => (
          <li key={e.id} className="flex items-center gap-2">
            <span className="text-muted-foreground tabular-nums">
              {new Date(e.at).toLocaleTimeString('vi-VN')}
            </span>
            <span className="flex-1">{e.label}</span>
            {i === entries.length - 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                disabled={busy}
                onClick={() => void undo()}
              >
                <Undo2 /> {tx('common.undo')}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

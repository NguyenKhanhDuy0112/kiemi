import { diffTests, type StepChange, type TestCase } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { errorMessage } from '@renderer/lib/errors';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { stepText } from './describe';
import { useEditorStore } from './editor-store';

const when = (d: Date | string) => new Date(d).toLocaleString('vi-VN');

/** Earlier versions of the open test: pick one to see what differs from now, and restore it [T-05]. */
export function HistoryButton({ testId, doc }: { testId: string; doc: TestCase }) {
  const tx = useTx();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const history = useQuery({
    ...trpc.testCases.history.queryOptions({ id: testId }),
    enabled: open,
  });
  const old = useQuery({
    ...trpc.testCases.versionContent.queryOptions({ versionId: picked ?? '' }),
    enabled: picked !== null,
  });
  const diff = useMemo(() => (old.data ? diffTests(old.data, doc) : null), [old.data, doc]);

  const restore = async () => {
    if (!picked) return;
    try {
      const row = await trpcClient.testCases.restoreVersion.mutate({
        id: testId,
        versionId: picked,
      });
      useEditorStore.getState().load(testId, row.content, row.version);
      await qc.invalidateQueries({ queryKey: trpc.testCases.get.queryKey({ id: testId }) });
      await qc.invalidateQueries({ queryKey: trpc.testCases.history.queryKey({ id: testId }) });
      toast.success(tx('ui.history2.restored'));
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  const line = (c: StepChange) => {
    const s = 'after' in c ? c.after : c.before;
    const text = stepText(s, doc.elements, tx);
    return `${tx(`ui.history2.kind.${c.kind}`)}: ${text}${'fields' in c ? ` (${c.fields.join(', ')})` : ''}`;
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={tx('ui.history2.title')}
        data-testid="history-button"
        onClick={() => setOpen(true)}
      >
        <History />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{tx('ui.history2.title')}</DialogTitle>
            <DialogDescription>{tx('ui.history2.hint')}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] gap-4">
            <ul
              className="w-56 shrink-0 overflow-auto rounded-md border"
              aria-label={tx('ui.history2.title')}
            >
              {(history.data ?? []).length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">{tx('ui.history2.empty')}</li>
              )}
              {(history.data ?? []).map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(h.id)}
                    className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent ${picked === h.id ? 'bg-accent' : ''}`}
                  >
                    <span>{when(h.savedAt)}</span>
                    <span className="text-xs text-muted-foreground">
                      {tx('ui.history2.steps', { count: h.steps })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="min-w-0 flex-1 overflow-auto text-sm" data-testid="history-diff">
              {!diff ? (
                <p className="text-muted-foreground">{tx('ui.history2.pick')}</p>
              ) : diff.same ? (
                <p>{tx('ui.history2.same')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {diff.nameChanged && (
                    <li>
                      {tx('ui.history2.name', {
                        before: diff.nameChanged.before,
                        after: diff.nameChanged.after,
                      })}
                    </li>
                  )}
                  {diff.otherChanges.length > 0 && (
                    <li>{tx('ui.history2.other', { parts: diff.otherChanges.join(', ') })}</li>
                  )}
                  {diff.steps.map((c) => (
                    <li key={`${c.kind}-${c.id}`}>{line(c)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button disabled={!picked} onClick={() => void restore()}>
              {tx('ui.history2.restore')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

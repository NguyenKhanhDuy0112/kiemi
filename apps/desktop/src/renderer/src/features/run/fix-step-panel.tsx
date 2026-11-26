import type { Locator, TestCase } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { errorMessage } from '@renderer/lib/errors';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { findStep, updateStep } from '../editor/doc-model';
import { type PickSource, PickSourceContext } from '../editor/pick-context';
import { StepForm } from '../editor/props-panel';
import { useRunStore } from './run-store';

/**
 * "Sửa bước" beside a paused run: same form as the editor, Pick / Highlight on the
 * page the run keeps open, then save the test and retry the step [FX-02, FX-03].
 */
export function FixStepPanel({
  runId,
  testCaseId,
  doc,
  version,
  stepId,
  failed,
}: {
  runId: string;
  testCaseId: string;
  doc: TestCase;
  version: number;
  stepId: string;
  /** The run waits on this step because it failed (so "Thử lại" makes sense). */
  failed: boolean;
}) {
  const tx = useTx();
  const qc = useQueryClient();
  const decide = useRunStore((s) => s.decide);
  const [draft, setDraft] = useState(doc);
  const [busy, setBusy] = useState(false);
  // A different step, or the saved test changed: start from the stored test again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on step / version only.
  useEffect(() => setDraft(doc), [stepId, version]);

  const source = useMemo<PickSource>(
    () => ({
      pick: async () =>
        (await trpcClient.runs.livePick.mutate({ runId })).locator as Locator | null,
      highlight: (locator) => trpcClient.runs.liveHighlight.mutate({ runId, locator }),
    }),
    [runId],
  );
  const step = findStep(draft, stepId);
  if (!step) return null;
  const dirty = draft !== doc;

  const apply = async (retry: boolean) => {
    setBusy(true);
    try {
      // The engine takes the edited step even if saving fails (e.g. the test changed meanwhile).
      await trpcClient.runs.control.mutate({ runId, command: { type: 'edit', step } });
      try {
        await trpcClient.testCases.save.mutate({ id: testCaseId, version, content: draft });
        await qc.invalidateQueries({ queryKey: trpc.testCases.get.queryKey({ id: testCaseId }) });
      } catch (err) {
        toast.warning(`${tx('ui.run.fixNotSaved')} ${errorMessage(err, tx)}`);
      }
      if (retry) await decide(runId, 'retry');
      else toast.success(tx('ui.run.fixApplied'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l"
      aria-label={tx('ui.run.fixTitle')}
    >
      <PickSourceContext.Provider value={source}>
        <StepForm
          doc={draft}
          step={step}
          focusParam={null}
          onPatch={(p) => setDraft((d) => updateStep(d, stepId, p))}
        />
      </PickSourceContext.Provider>
      <div className="sticky bottom-0 flex gap-2 border-t bg-background p-3">
        {failed && (
          <Button size="sm" disabled={busy} onClick={() => void apply(true)}>
            <RotateCcw /> {tx('ui.run.saveAndRetry')}
          </Button>
        )}
        <Button
          size="sm"
          variant={failed ? 'outline' : 'default'}
          disabled={busy || !dirty}
          onClick={() => void apply(false)}
        >
          <Save /> {tx('ui.run.saveFix')}
        </Button>
      </div>
    </aside>
  );
}

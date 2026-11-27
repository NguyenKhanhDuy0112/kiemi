import type { RunError } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type Diagnosis = Awaited<ReturnType<typeof trpcClient.ai.diagnose.mutate>>;

const pretty = (v: unknown): string => JSON.stringify(v, null, 1);

/** "Đề xuất sửa" on a failed step: the cause, a diff, one button to apply [FX-12, AI-09, AI-10]. */
export function SuggestFixButton({
  testCaseId,
  stepId,
  error,
  environmentName,
}: {
  testCaseId: string;
  stepId: string;
  error: RunError;
  environmentName?: string | null | undefined;
}) {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const settings = useQuery({ ...trpc.ai.get.queryOptions({ projectId }), enabled: !!projectId });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [also, setAlso] = useState(true);
  const [applied, setApplied] = useState(false);

  if (settings.data?.enabled !== true) return null;

  const ask = async () => {
    setBusy(true);
    try {
      setResult(
        await trpcClient.ai.diagnose.mutate({
          projectId,
          testCaseId,
          stepId,
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
          environmentName: environmentName ?? null,
        }),
      );
      setApplied(false);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (fix: NonNullable<Diagnosis['fix']>) => {
    try {
      const r = await trpcClient.ai.applyFix.mutate({
        projectId,
        testCaseId,
        stepId: fix.stepId,
        params: fix.after,
        alsoSameTarget: also && fix.alsoSteps.length > 0,
      });
      setApplied(true);
      await qc.invalidateQueries();
      toast.success(tx('ui.ai.fix.applied', { count: r.updated.length }));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <div className="mt-1 flex flex-col gap-2" data-testid="ai-fix">
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-fit px-2 text-xs"
        disabled={busy}
        onClick={() => void ask()}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {tx('ui.ai.fix.button')}
      </Button>
      {result && (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2 text-xs">
          <p>
            <b>{tx(`ui.ai.fix.category.${result.category}`)}</b> — {result.explanation}
          </p>
          {result.fix && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <pre className="max-h-40 overflow-auto rounded bg-fail-soft p-1.5">
                  {pretty(result.fix.before)}
                </pre>
                <pre className="max-h-40 overflow-auto rounded bg-pass-soft p-1.5">
                  {pretty(result.fix.after)}
                </pre>
              </div>
              {result.fix.why && <p className="text-muted-foreground">{result.fix.why}</p>}
              {result.fix.alsoSteps.length > 0 && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={also}
                    onChange={(e) => setAlso(e.target.checked)}
                  />
                  {tx('ui.ai.fix.also', { count: result.fix.alsoSteps.length })}
                </label>
              )}
              <div>
                <Button
                  size="sm"
                  disabled={applied}
                  onClick={() => void apply(result.fix as NonNullable<Diagnosis['fix']>)}
                >
                  {applied ? tx('ui.ai.fix.done') : tx('ui.ai.fix.apply')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

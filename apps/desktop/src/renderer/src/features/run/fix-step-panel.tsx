import type { SimilarCandidate } from '@kiemi/engine';
import type { Locator, RunError, Step, TestCase } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { groupActions, useActions } from '@renderer/lib/actions';
import { errorMessage } from '@renderer/lib/errors';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Circle, ListPlus, RotateCcw, Save, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { defaultParams, findStep, insertStep, newStepId, updateStep } from '../editor/doc-model';
import { type PickSource, PickSourceContext } from '../editor/pick-context';
import { StepForm } from '../editor/props-panel';
import { expectationUpdate, mismatchOf } from './bug-report';
import { copyBugReport } from './copy-bug';
import { classifyFailure, type QuickFixActions, QuickFixes } from './quick-fixes';
import { useRunStore } from './run-store';

/**
 * "Sửa bước" beside a paused run: same form as the editor, Pick / Highlight on the
 * page the run keeps open, then save the test and retry the step [FX-02, FX-03].
 */
/** Action picker grouped like the "Thêm bước" menu of the editor. */
function InsertMenu({ label, onPick }: { label: string; onPick: (type: string) => void }) {
  const tx = useTx();
  const { data: actions } = useActions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <ListPlus /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {groupActions(actions ?? []).map((g) => (
          <DropdownMenuSub key={g.group}>
            <DropdownMenuSubTrigger>
              {tx(`ui.groups.${g.group}`, undefined, g.group)}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-96 overflow-auto">
              {g.actions.map((a) => (
                <DropdownMenuItem key={a.type} onSelect={() => onPick(a.type)}>
                  {tx(`ui.steps.${a.type}.label`, undefined, a.type)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FixStepPanel({
  runId,
  testCaseId,
  doc,
  version,
  projectId,
  environmentName,
  screenshots,
  stepId,
  failed,
  error,
}: {
  runId: string;
  testCaseId: string;
  doc: TestCase;
  version: number;
  stepId: string;
  /** The run waits on this step because it failed (so "Thử lại" makes sense). */
  failed: boolean;
  projectId: string;
  environmentName?: string | null | undefined;
  /** Screenshot files of the failed step (for the bug report). */
  screenshots?: string[] | undefined;
  /** Why the step failed, for the quick fixes. */
  error?: RunError | undefined;
}) {
  const tx = useTx();
  const qc = useQueryClient();
  const decide = useRunStore((s) => s.decide);
  const { data: actions } = useActions();
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const [draft, setDraft] = useState(doc);
  const [busy, setBusy] = useState(false);
  /** Step being edited: the waiting one, or one just added next to it [FX-04]. */
  const [focusId, setFocusId] = useState(stepId);
  /** Steps added in this panel, not yet sent to the run. */
  const [added, setAdded] = useState<{ id: string; where: 'before' | 'after'; anchor: string }[]>(
    [],
  );
  // A different step, or the saved test changed: start from the stored test again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on step / version only.
  useEffect(() => {
    setDraft(doc);
    setFocusId(stepId);
    setAdded([]);
  }, [stepId, version]);

  const source = useMemo<PickSource>(
    () => ({
      pick: async () =>
        (await trpcClient.runs.livePick.mutate({ runId })).locator as Locator | null,
      highlight: (locator) => trpcClient.runs.liveHighlight.mutate({ runId, locator }),
    }),
    [runId],
  );
  const [recording, setRecording] = useState(false);
  // The run moved on: the engine stopped recording by itself.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on step / version only.
  useEffect(() => setRecording(false), [stepId, version]);

  const step = findStep(draft, focusId);
  if (!step) return null;
  const dirty = draft !== doc;

  /** What the tester does on the open page goes before the failed step; it is already done, so only the test gets it [FX-04]. */
  const toggleRecord = async () => {
    try {
      if (!recording) {
        await trpcClient.runs.liveRecord.mutate({ runId, action: 'start' });
        setRecording(true);
        return;
      }
      setRecording(false);
      const { steps } = await trpcClient.runs.liveRecord.mutate({ runId, action: 'stop' });
      if (steps.length === 0) return;
      setDraft((d) => {
        let next = d;
        for (const s of steps)
          next = insertStep(next, { ...s, id: newStepId(next) }, { beforeId: stepId });
        return next;
      });
      toast.success(tx('ui.run.recorded', { count: steps.length }));
    } catch (err) {
      setRecording(false);
      toast.error(errorMessage(err, tx));
    }
  };

  const addStep = (type: string, where: 'before' | 'after') => {
    const info = actions?.find((a) => a.type === type);
    const id = newStepId(draft);
    const created: Step = {
      id,
      action: type,
      params: info ? defaultParams(info.schema) : {},
      session: findStep(draft, stepId)?.session ?? 'default',
      enabled: true,
      mode: 'hard',
    };
    setDraft((d) =>
      insertStep(d, created, where === 'before' ? { beforeId: stepId } : { afterId: stepId }),
    );
    setAdded((a) => [...a, { id, where, anchor: stepId }]);
    setFocusId(id);
  };

  const apply = async (retry: boolean, base: TestCase = draft, sendAdded = added) => {
    setBusy(true);
    try {
      // The engine takes the edited step even if saving fails (e.g. the test changed meanwhile).
      const edit = (command: Parameters<typeof trpcClient.runs.control.mutate>[0]['command']) =>
        trpcClient.runs.control.mutate({ runId, command });
      for (const a of sendAdded) {
        const s = findStep(base, a.id);
        if (s)
          await edit({ type: 'edit', insert: { stepId: a.anchor, where: a.where, steps: [s] } });
      }
      // The waiting step itself, unless it is one of the steps just added.
      const edited = sendAdded.some((a) => a.id === stepId) ? undefined : findStep(base, stepId);
      if (edited) await edit({ type: 'edit', step: edited });
      try {
        await trpcClient.testCases.save.mutate({ id: testCaseId, version, content: base });
        await qc.invalidateQueries({ queryKey: trpc.testCases.get.queryKey({ id: testCaseId }) });
      } catch (err) {
        toast.warning(`${tx('ui.run.fixNotSaved')} ${errorMessage(err, tx)}`);
      }
      setAdded([]);
      if (retry) await decide(runId, 'retry');
      else toast.success(tx('ui.run.fixApplied'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      setBusy(false);
    }
  };

  // Quick fixes: change the draft, then send it and retry in one go [FX-06].
  const waiting = findStep(draft, stepId);
  const retryWith = (next: TestCase) => {
    setDraft(next);
    void apply(true, next);
  };
  const quick: QuickFixActions = {
    hasTarget: waiting?.params.target !== undefined,
    busy,
    onRepick: () => {
      void (async () => {
        const picked = await source.pick().catch(() => null);
        if (picked)
          retryWith(updateStep(draft, stepId, { params: { ...waiting?.params, target: picked } }));
      })();
    },
    onSimilar: async () => {
      const target = waiting?.params.target as Locator | { ref: string } | undefined;
      const locator = !target ? undefined : 'ref' in target ? draft.elements[target.ref] : target;
      if (!locator) return [];
      return (await trpcClient.runs.liveSimilar.mutate({ runId, locator }))
        .candidates as SimilarCandidate[];
    },
    onUseCandidate: (c) =>
      retryWith(updateStep(draft, stepId, { params: { ...waiting?.params, target: c.locator } })),
    onWaitLonger: () =>
      retryWith(
        updateStep(draft, stepId, {
          timeoutMs: Math.max(20_000, (waiting?.timeoutMs ?? 10_000) * 2),
        }),
      ),
    onAddWaitStep: () => {
      const id = newStepId(draft);
      const created: Step = {
        id,
        action: 'wait',
        params: { seconds: 3 },
        session: waiting?.session ?? 'default',
        enabled: true,
        mode: 'hard',
      };
      const next = insertStep(draft, created, { beforeId: stepId });
      const entry = { id, where: 'before' as const, anchor: stepId };
      setAdded((a) => [...a, entry]);
      setDraft(next);
      void apply(true, next, [...added, entry]);
    },
    mismatch: mismatchOf(error?.details),
    canUpdate:
      !!waiting &&
      !!error &&
      !!mismatchOf(error.details) &&
      expectationUpdate(waiting, mismatchOf(error.details)?.actual ?? '') !== undefined,
    onUpdateExpectation: () => {
      const m = mismatchOf(error?.details);
      const params = waiting && m ? expectationUpdate(waiting, m.actual) : undefined;
      if (params) retryWith(updateStep(draft, stepId, { params }));
    },
    onCopyBug: () => {
      if (error)
        void copyBugReport({ doc: draft, stepId, error, environmentName, screenshots, tx });
    },
    onAddPopupRule: (when, button) => {
      void (async () => {
        try {
          const rules = [
            ...(project.data?.popupRules ?? []),
            {
              id: `popup-${Date.now().toString(36)}`,
              name: when.slice(0, 40),
              enabled: true,
              when: { strategies: [{ kind: 'text' as const, value: when }] },
              action: {
                kind: 'click' as const,
                target: { strategies: [{ kind: 'text' as const, value: button }] },
              },
            },
          ];
          await trpcClient.projects.setPopupRules.mutate({ id: projectId, rules });
          await trpcClient.runs.control.mutate({
            runId,
            command: { type: 'edit', popupRules: rules },
          });
          await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
          await apply(true);
        } catch (err) {
          toast.error(errorMessage(err, tx));
        }
      })();
    },
  };

  return (
    <aside
      className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l"
      aria-label={tx('ui.run.fixTitle')}
    >
      {failed && error && <QuickFixes kind={classifyFailure(error)} {...quick} />}
      <PickSourceContext.Provider value={source}>
        <StepForm
          doc={draft}
          step={step}
          focusParam={null}
          onPatch={(p) => setDraft((d) => updateStep(d, stepId, p))}
        />
      </PickSourceContext.Provider>
      <div className="flex gap-2 border-t px-4 py-2">
        {failed && (
          <Button
            size="sm"
            variant={recording ? 'destructive' : 'outline'}
            onClick={() => void toggleRecord()}
          >
            {recording ? <Square /> : <Circle />}{' '}
            {recording ? tx('ui.run.recordStop') : tx('ui.run.recordHere')}
          </Button>
        )}
        {failed && (
          <InsertMenu label={tx('ui.run.insertBefore')} onPick={(t) => addStep(t, 'before')} />
        )}
        <InsertMenu label={tx('ui.run.insertAfter')} onPick={(t) => addStep(t, 'after')} />
      </div>
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

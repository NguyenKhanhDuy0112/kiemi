import { EmptyState } from '@renderer/components/empty-state';
import { Button } from '@renderer/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip';
import { errorMessage, isConflict } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Circle, CircleCheck, ListChecks, Loader2, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EditorTour } from '../onboarding/tour';
import { EditorMoreMenu } from '../record/more-menu';
import { RecordButton } from '../record/record-button';
import { RecordPanel } from '../record/record-panel';
import { EditorRunButton } from '../run/editor-run-button';
import { duplicateStep, findStep, savedVariables } from './doc-model';
import { useEditorStore } from './editor-store';
import { DataTab, SessionsTab, VariablesTab } from './editor-tabs';
import { PropsPanel } from './props-panel';
import { AddStepMenu, StepTable, useDeleteStep } from './step-table';
import { AdvancedModeContext } from './strategies';
import { VariableSourcesContext } from './variable-input';
import type { VariableSources } from './variable-suggest';

const AUTOSAVE_MS = 800;

const typingInField = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

/** Test editor (S-02): step table + detail panel + Data / Variables / Sessions tabs. */
/** Same cadence as the main process lock heartbeat (`main/projects/locks.ts`). */
const LOCK_HEARTBEAT_MS = 30_000;

export function EditorScreen({ testId }: { testId: string }) {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId);
  const openTest = useAppStore((s) => s.openTest);
  const detailOpen = useAppStore((s) => s.detailOpen);
  const store = useEditorStore();
  const { doc, dirty, version, past, future, selectedId } = store;
  const [focusParam, setFocusParam] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  /** "Chạy từ bước này" opens the run options preset to that step [H-03]. */
  const [runFrom, setRunFrom] = useState<string | null>(null);
  // Stable so the memoised step rows are not re-rendered on every edit (N-05).
  const onChip = useCallback((id: string, param: string) => {
    useEditorStore.getState().select(id);
    setFocusParam(param);
  }, []);
  const del = useDeleteStep();

  const test = useQuery(trpc.testCases.get.queryOptions({ id: testId }));
  const settings = useQuery(trpc.system.settings.queryOptions());
  const save = useMutation(trpc.testCases.save.mutationOptions());
  const envs = useQuery({
    ...trpc.environments.list.queryOptions({ projectId: projectId ?? '' }),
    enabled: !!projectId,
  });
  const firstEnvId = envs.data?.[0]?.id;
  const env = useQuery({
    ...trpc.environments.get.queryOptions({ id: firstEnvId ?? '' }),
    enabled: !!firstEnvId,
  });
  const shared = useQuery({
    ...trpc.sharedSteps.list.queryOptions({ projectId: projectId ?? '' }),
    enabled: !!projectId,
  });
  const datasets = useQuery({
    ...trpc.datasets.list.queryOptions({ projectId: projectId ?? '' }),
    enabled: !!projectId,
  });

  // Load (or reload) the document from the database.
  useEffect(() => {
    if (!test.data) return;
    const s = useEditorStore.getState();
    if (s.testId !== testId) {
      s.load(testId, test.data.content, test.data.version);
      setConflict(false);
    } else if (!s.dirty && test.data.version > s.version) {
      // A teammate's change came in from the project folder and nothing is unsaved here [T-01].
      s.load(testId, test.data.content, test.data.version);
    }
  }, [test.data, testId]);

  // Soft lock: tell teammates on the shared folder that this test is open [T-01].
  const [lockedBy, setLockedBy] = useState<{ user: string; host: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const touch = () =>
      void trpcClient.projects.touchLock
        .mutate({ testId })
        .then((r) => alive && setLockedBy(r.heldBy))
        .catch(() => undefined);
    touch();
    const timer = setInterval(touch, LOCK_HEARTBEAT_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      void trpcClient.projects.releaseLock.mutate({ testId }).catch(() => undefined);
    };
  }, [testId]);

  const doSave = useCallback(async () => {
    const s = useEditorStore.getState();
    if (!s.doc || !s.dirty || s.testId !== testId) return;
    try {
      const row = await save.mutateAsync({ id: testId, version: s.version, content: s.doc });
      useEditorStore.getState().markSaved(row.version);
      qc.setQueryData(trpc.testCases.get.queryKey({ id: testId }), row);
      if (projectId)
        void qc.invalidateQueries({ queryKey: trpc.testCases.list.queryKey({ projectId }) });
    } catch (err) {
      if (isConflict(err)) setConflict(true);
      else toast.error(errorMessage(err, tx));
    }
  }, [save, testId, qc, projectId, tx]);

  // Leaving the editor: flush unsaved changes, then forget the document.
  useEffect(
    () => () => {
      const s = useEditorStore.getState();
      if (s.dirty && s.doc && s.testId === testId) {
        void trpcClient.testCases.save
          .mutate({ id: testId, version: s.version, content: s.doc })
          .then(() =>
            qc.invalidateQueries({ queryKey: trpc.testCases.get.queryKey({ id: testId }) }),
          )
          .catch(() => undefined);
      }
      useEditorStore.setState({
        testId: null,
        doc: null,
        past: [],
        future: [],
        dirty: false,
        selectedId: null,
      });
    },
    [testId, qc],
  );

  // Autosave shortly after the last change.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `doc` restarts the debounce on every edit.
  useEffect(() => {
    if (!dirty || conflict) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void doSave(), AUTOSAVE_MS);
    return () => clearTimeout(timer.current);
  }, [doc, dirty, conflict, doSave]);

  // Keyboard shortcuts (U-10).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const s = useEditorStore.getState();
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave();
      } else if (mod && e.key.toLowerCase() === 'z' && !typingInField(e)) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !typingInField(e)) {
        e.preventDefault();
        s.redo();
      } else if (mod && e.key.toLowerCase() === 'd' && s.selectedId && !typingInField(e)) {
        e.preventDefault();
        const id = s.selectedId;
        let newId: string | undefined;
        s.apply((d) => {
          const r = duplicateStep(d, id);
          newId = r.newId;
          return r.doc;
        });
        if (newId) s.select(newId);
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        s.selectedId &&
        s.doc &&
        !typingInField(e)
      ) {
        const step = findStep(s.doc, s.selectedId);
        if (step) {
          e.preventDefault();
          del(step);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSave, del]);

  const sources: VariableSources = useMemo(() => {
    const ds = doc?.dataset;
    const columns =
      ds?.source === 'table'
        ? ds.columns
        : ds?.source === 'saved'
          ? (datasets.data?.find((d) => d.id === ds.datasetId)?.columns ?? [])
          : [];
    return {
      environment: Object.keys(env.data?.variables ?? {}),
      test: Object.keys(doc?.variables ?? {}),
      data: columns,
      secret: (env.data?.secrets ?? []).map((s) => s.name),
      saved: doc ? savedVariables(doc) : [],
    };
  }, [doc, env.data, datasets.data]);

  const sharedNames = useMemo(
    () => new Map((shared.data ?? []).map((s) => [s.id, s.name])),
    [shared.data],
  );

  if (!doc || test.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const status = save.isPending ? (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Loader2 className="size-3 animate-spin" /> {tx('ui.actions.saving')}
    </span>
  ) : dirty ? (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Circle className="size-3" /> {tx('ui.actions.unsaved')}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <CircleCheck className="size-3 text-pass-text" /> {tx('ui.actions.saved')}
    </span>
  );

  return (
    <AdvancedModeContext.Provider value={settings.data?.advancedMode === true}>
      <VariableSourcesContext.Provider value={sources}>
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={tx('ui.editor.back')}
              onClick={() => openTest(null)}
            >
              <ArrowLeft />
            </Button>
            <h1 className="min-w-0 truncate text-base font-semibold">{doc.name}</h1>
            {status}
            <div className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={tx('ui.editor.undo')}
                    disabled={!past.length}
                    onClick={store.undo}
                  >
                    <Undo2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tx('ui.editor.undo')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={tx('ui.editor.redo')}
                    disabled={!future.length}
                    onClick={store.redo}
                  >
                    <Redo2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tx('ui.editor.redo')}</TooltipContent>
              </Tooltip>
              <EditorMoreMenu testId={testId} doc={doc} beforeCreate={doSave} />
              <span data-tour="record" className="inline-flex">
                <RecordButton
                  testId={testId}
                  doc={doc}
                  selectedId={selectedId}
                  beforeRecord={doSave}
                />
              </span>
              <span data-tour="run" className="inline-flex">
                <EditorRunButton
                  testId={testId}
                  testCase={doc}
                  beforeRun={doSave}
                  dialogStartAt={runFrom ?? undefined}
                  onDialogClose={() => setRunFrom(null)}
                />
              </span>
            </div>
          </header>
          <RecordPanel testId={testId} />
          {lockedBy && (
            <div
              role="status"
              className="border-b border-warning/40 bg-warning-soft px-4 py-2 text-sm text-warning-text"
            >
              {tx('ui.projectFolder.lockedBy', { user: lockedBy.user, host: lockedBy.host })}
            </div>
          )}
          {conflict && (
            <div
              role="alert"
              className="flex items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm"
            >
              {tx('ui.editor.conflict')}
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const fresh = await test.refetch();
                  if (fresh.data)
                    useEditorStore.getState().load(testId, fresh.data.content, fresh.data.version);
                  setConflict(false);
                }}
              >
                {tx('ui.editor.reload')}
              </Button>
            </div>
          )}
          <div className="flex min-h-0 flex-1">
            <Tabs defaultValue="steps" className="flex min-w-0 flex-1 flex-col gap-0">
              <TabsList className="mx-3 mt-2">
                <TabsTrigger value="steps">{tx('ui.editor.tabs.steps')}</TabsTrigger>
                <TabsTrigger value="data">{tx('ui.editor.tabs.data')}</TabsTrigger>
                <TabsTrigger value="variables">{tx('ui.editor.tabs.variables')}</TabsTrigger>
                <TabsTrigger value="sessions">{tx('ui.editor.tabs.sessions')}</TabsTrigger>
              </TabsList>
              <TabsContent
                value="steps"
                data-tour="steps"
                className="flex min-h-0 flex-1 flex-col overflow-auto"
              >
                {doc.steps.length === 0 && doc.cleanup.length === 0 ? (
                  <EmptyState
                    icon={ListChecks}
                    title={tx('ui.editor.emptyTitle')}
                    text={tx('ui.editor.emptyText')}
                    action={<AddStepMenu />}
                  />
                ) : (
                  <>
                    <StepTable sharedNames={sharedNames} onRunFrom={setRunFrom} onChip={onChip} />
                    <div className="p-3">
                      <AddStepMenu variant="outline" />
                    </div>
                  </>
                )}
              </TabsContent>
              <TabsContent value="data" className="overflow-auto">
                <DataTab />
              </TabsContent>
              <TabsContent value="variables" className="overflow-auto">
                <VariablesTab />
              </TabsContent>
              <TabsContent value="sessions" className="overflow-auto">
                <SessionsTab />
              </TabsContent>
            </Tabs>
            {detailOpen && (
              <aside
                className="panel-enter w-96 shrink-0 overflow-auto border-l"
                aria-label={tx('ui.props.title')}
              >
                <PropsPanel key={selectedId ?? 'none'} focusParam={focusParam} />
              </aside>
            )}
          </div>
        </div>
        <span hidden data-version={version} />
        <EditorTour />
      </VariableSourcesContext.Provider>
    </AdvancedModeContext.Provider>
  );
}

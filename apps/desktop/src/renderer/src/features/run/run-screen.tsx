import type { Step, TestCase } from '@kiemi/schema';
import { describeRunError } from '@kiemi/shared';
import { artifactUrl } from '@main/results/artifact-url';
import { Mascot } from '@renderer/components/mascot/mascot';
import { moodForStatus } from '@renderer/components/mascot/mood';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@renderer/components/ui/dialog';
import { downloadBase64, reportFileName } from '@renderer/lib/download';
import { envColor } from '@renderer/lib/environment';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { cn } from '@renderer/lib/utils';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bug,
  CircleAlert,
  Download,
  FileSearch,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Square,
  StepForward,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { childLists } from '../editor/doc-model';
import { StepSentence } from '../editor/step-sentence';
import { EnvironmentPill } from '../environments/environment-badge';
import { bugMarkdown, copyBugReport } from './copy-bug';
import { CreateIssueButton } from './create-issue-button';
import { FixLog } from './fix-log';
import { FixStepPanel } from './fix-step-panel';
import { FormMatrixView } from './form-matrix';
import { outcomesOf } from './form-outcomes';
import { buildHtmlReport } from './report';
import { buildReportSheets } from './report-tables';
import { useStartRun } from './run-dialog';
import { useRunFixes } from './run-fixes';
import {
  fromDetail,
  isFinished,
  type LiveCase,
  type LiveCaseStatus,
  type LiveRun,
} from './run-state';
import { useRunStore } from './run-store';
import { StatusIcon } from './step-status';
import { diffOf, type TableDiffView } from './table-diff';
import { TableDiff } from './table-diff-view';

const STATUS_BADGE: Record<LiveCaseStatus, string> = {
  queued: 'border-muted-foreground/40 text-muted-foreground',
  running: 'border-primary/40 bg-info-soft text-primary',
  passed: 'border-pass/50 bg-pass-soft text-pass-text',
  failed: 'border-fail/50 bg-fail-soft text-fail-text',
  error: 'border-fail/50 bg-fail-soft text-fail-text',
  cancelled: 'border-muted-foreground/40 text-muted-foreground',
  skipped: 'border-muted-foreground/40 text-muted-foreground',
};

export function RunStatusBadge({ status }: { status: LiveCaseStatus }) {
  const tx = useTx();
  return (
    <Badge variant="outline" className={STATUS_BADGE[status]}>
      {status === 'running' && <Loader2 className="animate-spin" />}
      {tx(`ui.run.status.${status}`)}
    </Badge>
  );
}

const seconds = (ms: number | undefined) =>
  ms === undefined ? undefined : (Math.round(ms / 100) / 10).toLocaleString('vi-VN');

function* walk(
  steps: Step[],
  prefix: string,
  depth: number,
): Generator<{ step: Step; no: string; depth: number; top: boolean }> {
  for (const [i, step] of steps.entries()) {
    const no = `${prefix}${i + 1}`;
    yield { step, no, depth, top: depth === 0 && !prefix.startsWith('C') };
    for (const c of childLists(step)) yield* walk(c.steps, `${no}.`, depth + 1);
  }
}

/** Live run from the store, else what the DB stored. */
function useRunView(runId: string) {
  const live = useRunStore((s) => s.runs[runId]);
  const watch = useRunStore((s) => s.watch);
  const detail = useQuery(trpc.runs.get.queryOptions({ runId }));
  const liveDone = live ? isFinished(live.status) : false;
  // Reload stored details (durations, files) once the run ends.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch only on completion.
  useEffect(() => {
    if (liveDone) void detail.refetch();
  }, [liveDone]);
  // Opened from history while still running: follow it.
  useEffect(() => {
    if (detail.data?.running) watch(runId);
  }, [detail.data?.running, runId, watch]);
  const view: LiveRun | undefined =
    live && live.cases.length > 0 && !(liveDone && detail.data && !detail.data.running)
      ? live
      : detail.data
        ? fromDetail(detail.data)
        : live;
  return { view, detail: detail.data, loading: detail.isLoading };
}

/** "Chạy test" + "Kết quả" in one screen: live progress, then results [S-03, S-04]. */
export function RunScreen({ runId }: { runId: string }) {
  const tx = useTx();
  const openRun = useAppStore((s) => s.openRun);
  const { view, detail } = useRunView(runId);
  const stop = useRunStore((s) => s.stop);
  const control = useRunStore((s) => s.control);
  const breakpoints = useRunStore((s) => s.breakpoints);
  const toggleBreakpoint = useRunStore((s) => s.toggleBreakpoint);
  const decide = useRunStore((s) => s.decide);
  const runTo = useRunStore((s) => s.runTo);
  const fixCount = useRunFixes((s) => s.byRun[runId]?.length ?? 0);
  const startRun = useStartRun();
  const [selected, setSelected] = useState<string | null>(null);
  /** Step opened in the "Sửa bước" panel while the run waits; default = the waiting step [FX-02]. */
  const [fixPick, setFixPick] = useState<string | null>(null);
  const waitingStep = view?.paused?.stepId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: forget the pick when the run moves on.
  useEffect(() => setFixPick(null), [waitingStep]);
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const projectForms = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const [shot, setShot] = useState<{ src: string; title: string } | null>(null);

  const testIds = useMemo(
    () => [...new Set((view?.cases ?? []).map((c) => c.testCaseId))],
    [view?.cases],
  );
  const tests = useQueries({
    queries: testIds.map((id) => ({ ...trpc.testCases.get.queryOptions({ id }), retry: false })),
  });
  const docs = useMemo(() => {
    const m: Record<string, TestCase | undefined> = {};
    testIds.forEach((id, i) => {
      m[id] = tests[i]?.data?.content;
    });
    return m;
  }, [testIds, tests]);
  /** Results of tests generated from a form spec, for the Field × Rule matrix [R-09]. */
  const formOutcomes = useMemo(() => outcomesOf(view?.cases ?? [], docs), [view?.cases, docs]);
  const matrixForms = useMemo(
    () =>
      (projectForms.data?.formSpecs ?? []).filter((f) =>
        formOutcomes.some((o) => o.formId === f.id),
      ),
    [projectForms.data?.formSpecs, formOutcomes],
  );
  // Workspace library steps are called by id too [O-07].
  const library = useQuery(trpc.sharedResources.list.queryOptions({ kind: 'shared_step' }));
  const shared = useQuery({
    ...trpc.sharedSteps.list.queryOptions({ projectId: detail?.projectId ?? '' }),
    enabled: !!detail?.projectId,
  });
  const sharedNames = useMemo(
    () =>
      new Map([
        ...(library.data ?? []).map((r) => [r.id, r.name] as const),
        ...(shared.data ?? []).map((s) => [s.id, s.name] as const),
      ]),
    [shared.data, library.data],
  );

  if (!view) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const running = !isFinished(view.status);
  const current =
    view.cases.find((c) => c.runCaseId === selected) ??
    view.cases.find((c) => c.status === 'running') ??
    view.cases.find((c) => c.status === 'failed' || c.status === 'error') ??
    view.cases[0];
  const target = view.target;
  const title =
    target?.kind === 'tag' ? tx('ui.run.tag', { tag: target.tag }) : (target?.name ?? '');
  const passed = view.cases.filter((c) => c.status === 'passed').length;
  const single = target?.kind === 'test';

  const rerun = async () => {
    if (!target) return;
    const t =
      target.kind === 'test'
        ? { kind: 'test' as const, testCaseId: target.testCaseId }
        : target.kind === 'suite'
          ? { kind: 'suite' as const, suiteId: target.suiteId }
          : { kind: 'tag' as const, projectId: detail?.projectId ?? '', tag: target.tag };
    await startRun(t);
  };

  /** Runs the failed test again, same data row and environment, and waits at the failure [FX-09]. */
  const fixAndRerun = async () => {
    if (!current) return;
    await startRun(
      {
        kind: 'test',
        testCaseId: current.testCaseId,
        ...(current.rowIndex === undefined ? {} : { rowIndex: current.rowIndex }),
      },
      { prefs: { environmentId: detail?.environmentId ?? null, headless: false } },
    );
  };
  const canFix = current?.status === 'failed' || current?.status === 'error';

  const reportInput = (screenshots: Record<string, string>) => ({
    run: view,
    title,
    environmentName: detail?.environmentName ?? null,
    environmentColor: detail?.environment ? envColor(detail.environment) : null,
    environmentProtected: detail?.environment?.protected === true,
    startedAt: detail?.startedAt ? new Date(detail.startedAt) : null,
    tests: docs,
    screenshots,
    sharedNames,
    tx,
  });
  /** Excel (Tổng hợp + Chi tiết) or PDF of the same report [X-01]. */
  const exportFile = async (kind: 'xlsx' | 'pdf') => {
    try {
      if (kind === 'xlsx') {
        const sheets = buildReportSheets(reportInput({}));
        const r = await trpcClient.reports.workbook.mutate({ sheets });
        const name = reportFileName(title, 'xlsx');
        downloadBase64(r.data, name);
        toast.success(tx('ui.run.reportSaved', { file: name }));
      } else {
        const screenshots = await trpcClient.runs.screenshots.query({ runId });
        const r = await trpcClient.reports.pdf.mutate({
          html: buildHtmlReport(reportInput(screenshots)),
        });
        const name = reportFileName(title, 'pdf');
        downloadBase64(r.data, name, 'application/pdf');
        toast.success(tx('ui.run.reportSaved', { file: name }));
      }
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  const exportReport = async () => {
    try {
      const screenshots = await trpcClient.runs.screenshots.query({ runId });
      const html = buildHtmlReport({
        run: view,
        title,
        environmentName: detail?.environmentName ?? null,
        environmentColor: detail?.environment ? envColor(detail.environment) : null,
        environmentProtected: detail?.environment?.protected === true,
        startedAt: detail?.startedAt ? new Date(detail.startedAt) : null,
        tests: docs,
        screenshots,
        sharedNames,
        tx,
      });
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      const name = `kiemi-${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'report'}-${stamp}.html`;
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(tx('ui.run.reportSaved', { file: name }));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={tx('ui.run.back')}
          onClick={() => openRun(null)}
        >
          <ArrowLeft />
        </Button>
        <Mascot mood={moodForStatus(view.status)} size={36} />
        <h1 className="min-w-0 truncate text-base font-semibold">{title}</h1>
        <RunStatusBadge status={view.status} />
        {detail?.environment && <EnvironmentPill env={detail.environment} />}
        <span className="text-xs text-muted-foreground">
          {detail && !detail.environment ? tx('ui.run.noEnvironment') : ''}
          {!running &&
            view.durationMs !== undefined &&
            ` · ${tx('ui.run.duration', { seconds: seconds(view.durationMs) })}`}
          {view.cases.length > 1 &&
            ` · ${tx('ui.run.summary', { passed, total: view.cases.length })}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {running ? (
            <>
              {view.paused?.error ? (
                <>
                  <Button size="sm" onClick={() => void decide(runId, 'retry')}>
                    <RotateCcw /> {tx('ui.run.retryStep')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void decide(runId, 'continue')}
                  >
                    <Play /> {tx('ui.run.continueAfter')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void decide(runId, 'skip')}>
                    <StepForward /> {tx('ui.run.skipStep')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void decide(runId, 'stop')}>
                    <Square /> {tx('ui.run.endTest')}
                  </Button>
                </>
              ) : view.paused ? (
                <>
                  <Button size="sm" onClick={() => void control(runId, 'resume')}>
                    <Play /> {tx('ui.run.resume')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void control(runId, 'step')}>
                    <StepForward /> {tx('ui.run.step')}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={view.stopping}
                  onClick={() => void control(runId, 'pause')}
                >
                  <Pause /> {tx('ui.run.pause')}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={view.stopping}
                onClick={() => void stop(runId)}
              >
                <Square /> {view.stopping ? tx('ui.run.stopping') : tx('ui.run.stop')}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void trpcClient.runs.openFolder.mutate({ runId })}
              >
                <FolderOpen /> {tx('ui.run.openFolder')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void exportReport()}>
                <Download /> {tx('ui.run.exportReport')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void exportFile('xlsx')}>
                <FileSpreadsheet /> {tx('ui.run.exportExcel')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void exportFile('pdf')}>
                <FileText /> {tx('ui.run.exportPdf')}
              </Button>
              {canFix && (
                <Button size="sm" variant="outline" onClick={() => void fixAndRerun()}>
                  <Wrench /> {tx('ui.run.fixAndRerun')}
                </Button>
              )}
              <Button size="sm" onClick={() => void rerun()}>
                <RotateCcw /> {tx('ui.run.rerun')}
              </Button>
            </>
          )}
        </div>
      </header>
      {detail?.environment?.protected && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-fail bg-fail-soft px-3 py-1.5 text-sm font-medium text-fail-text"
        >
          <ShieldAlert className="size-4" aria-hidden />
          {tx('ui.run.protectedBanner', { name: detail.environment.name })}
        </div>
      )}

      {running && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'flex items-center gap-2 border-b px-4 py-2 text-sm',
            view.paused ? 'bg-warning/10' : 'bg-primary/5',
          )}
        >
          {view.paused?.error ? (
            <>
              <CircleAlert className="size-4 shrink-0 text-fail-text" />
              <span>
                {tx('ui.run.failedAt', { step: view.paused.stepNo })}{' '}
                <span className="font-medium">
                  {describeRunError(view.paused.error, tx).message}
                </span>
              </span>
            </>
          ) : view.paused ? (
            <>
              <Pause className="size-4 text-warning-text" />
              {tx('ui.run.pausedAt', { step: view.paused.stepNo })}
            </>
          ) : (
            <>
              <Loader2 className="size-4 animate-spin text-primary" />
              {view.downloadPercent !== undefined
                ? tx('ui.run.downloading', { percent: Math.round(view.downloadPercent) })
                : view.stopping
                  ? tx('ui.run.stopping')
                  : current?.currentStepNo
                    ? tx('ui.run.progress', {
                        step: Math.min(current.stepsDone + 1, Math.max(current.stepCount, 1)),
                        total: current.stepCount,
                      })
                    : tx('ui.run.preparing')}
            </>
          )}
        </div>
      )}

      {!running && fixCount > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 border-b bg-info-soft px-4 py-2 text-sm"
        >
          <span className="flex-1">{tx('ui.run.confirmAfterFix', { count: fixCount })}</span>
          <Button size="sm" onClick={() => void rerun()}>
            <RotateCcw /> {tx('ui.run.rerunFromStart')}
          </Button>
          <FixLog runId={runId} className="w-full" />
        </div>
      )}

      {view.error && (
        <div role="alert" className="flex gap-2 border-b bg-fail/5 px-4 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-fail-text" />
          <div>
            <p className="font-medium">{describeRunError(view.error, tx).message}</p>
            <p className="text-muted-foreground">{describeRunError(view.error, tx).hint}</p>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {view.cases.length > 1 && (
          <nav aria-label={tx('ui.run.tests')} className="w-64 shrink-0 overflow-auto border-r p-2">
            <h2 className="mb-1 px-2 text-xs font-semibold text-muted-foreground uppercase">
              {tx('ui.run.tests')}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {view.cases.map((c) => (
                <li key={c.runCaseId}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.runCaseId)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                      current?.runCaseId === c.runCaseId && 'bg-accent',
                    )}
                  >
                    <StatusIcon
                      status={
                        c.status === 'queued' || c.status === 'cancelled' || c.status === 'error'
                          ? c.status === 'error'
                            ? 'failed'
                            : c.status === 'cancelled'
                              ? 'skipped'
                              : undefined
                          : c.status
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{c.testName}</span>
                    {c.rowIndex !== undefined && (
                      <span className="text-xs text-muted-foreground">#{c.rowIndex + 1}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="min-w-0 flex-1 overflow-auto">
          {!running &&
            matrixForms.map((f) => (
              <FormMatrixView
                key={f.id}
                form={f}
                outcomes={formOutcomes}
                onOpenCase={setSelected}
              />
            ))}
          {view.cases.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {running ? tx('ui.run.preparing') : tx('ui.run.emptyRun')}
            </p>
          ) : current ? (
            <CaseView
              runId={runId}
              c={current}
              doc={docs[current.testCaseId]}
              sharedNames={sharedNames}
              paused={view.paused?.runCaseId === current.runCaseId ? view.paused.stepId : undefined}
              breakpoints={single ? (breakpoints[current.testCaseId] ?? []) : undefined}
              onToggleBreakpoint={(stepId) => toggleBreakpoint(current.testCaseId, stepId, runId)}
              fixStepId={single && view.paused ? (fixPick ?? view.paused.stepId) : undefined}
              onSelectStep={single && view.paused ? setFixPick : undefined}
              onBuildIssue={(stepId) => {
                const doc = docs[current.testCaseId];
                const error = current.steps[stepId]?.error;
                if (!doc || !error) return null;
                return {
                  title: tx('ui.bug.title', { test: doc.name }),
                  body: bugMarkdown({
                    doc,
                    stepId,
                    error,
                    environmentName: detail?.environmentName,
                    sharedNames,
                    tx,
                  }),
                };
              }}
              onCopyBug={(stepId) => {
                const doc = docs[current.testCaseId];
                const error = current.steps[stepId]?.error;
                if (doc && error)
                  void copyBugReport({
                    doc,
                    stepId,
                    error,
                    environmentName: detail?.environmentName,
                    screenshots: current.steps[stepId]?.artifacts
                      .filter((a) => a.kind === 'screenshot')
                      .map((a) => a.path),
                    sharedNames,
                    tx,
                  });
              }}
              onRunTo={
                view.paused?.runCaseId === current.runCaseId && single
                  ? (stepId) => void runTo(runId, stepId)
                  : undefined
              }
              onShot={setShot}
            />
          ) : null}
        </div>
        {single && view.paused && current && docs[current.testCaseId] && (
          <FixStepPanel
            runId={runId}
            runCaseId={view.paused.runCaseId}
            testCaseId={current.testCaseId}
            doc={docs[current.testCaseId] as TestCase}
            version={tests[testIds.indexOf(current.testCaseId)]?.data?.version ?? 0}
            projectId={detail?.projectId ?? ''}
            environmentName={detail?.environmentName ?? null}
            screenshots={current.steps[view.paused.stepId]?.artifacts.map((x) => x.path)}
            error={view.paused.error}
            stepId={fixPick ?? view.paused.stepId}
            failed={
              view.paused.error !== undefined &&
              (fixPick ?? view.paused.stepId) === view.paused.stepId
            }
          />
        )}
      </div>

      <Dialog open={shot !== null} onOpenChange={(o) => !o && setShot(null)}>
        <DialogContent className="sm:max-w-5xl">
          <DialogTitle>{shot?.title}</DialogTitle>
          {shot && (
            <img src={shot.src} alt={shot.title} className="max-h-[75vh] w-full object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CaseView({
  runId,
  c,
  doc,
  sharedNames,
  paused,
  breakpoints,
  onToggleBreakpoint,
  onRunTo,
  onCopyBug,
  onBuildIssue,
  fixStepId,
  onSelectStep,
  onShot,
}: {
  runId: string;
  c: LiveCase;
  doc: TestCase | undefined;
  sharedNames: ReadonlyMap<string, string>;
  paused: string | undefined;
  breakpoints: string[] | undefined;
  onToggleBreakpoint: (stepId: string) => void;
  /** Set while the run is paused: run to a later step and pause there [FX-05]. */
  onRunTo: ((stepId: string) => void) | undefined;
  /** "Copy báo cáo bug" of a failed step [X-02]. */
  onCopyBug: (stepId: string) => void;
  onBuildIssue: (stepId: string) => { title: string; body: string } | null;
  /** Step shown in the "Sửa bước" panel, and how to open another one [FX-02]. */
  fixStepId: string | undefined;
  onSelectStep: ((stepId: string) => void) | undefined;
  onShot: (s: { src: string; title: string }) => void;
}) {
  const tx = useTx();
  const rows = doc ? [...walk(doc.steps, '', 0), ...walk(doc.cleanup, 'C', 0)] : [];
  const videos = c.artifacts.filter((a) => a.kind === 'video');
  const traces = c.artifacts.filter((a) => a.kind === 'trace');
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <h2 className="text-sm font-semibold">{c.testName}</h2>
        {c.rowIndex !== undefined && (
          <span className="text-xs text-muted-foreground">
            {tx('ui.run.row', { row: c.rowIndex + 1 })}
          </span>
        )}
        <RunStatusBadge status={c.status} />
        {c.durationMs !== undefined && (
          <span className="text-xs text-muted-foreground">
            {tx('ui.run.duration', { seconds: seconds(c.durationMs) })}
          </span>
        )}
      </div>
      {c.error && !Object.values(c.steps).some((s) => s.error) && (
        <p className="mx-4 my-2 rounded-md border-l-4 border-fail bg-fail/5 px-3 py-2 text-sm">
          {describeRunError(c.error, tx).message}
        </p>
      )}
      <ul className="flex flex-col" aria-label={tx('ui.run.tests')}>
        {rows.length === 0 && Object.keys(c.steps).length === 0 && (
          <li className="px-4 py-3 text-sm text-muted-foreground">{tx('ui.run.noSteps')}</li>
        )}
        {rows.map(({ step, no, depth, top }) => {
          const r = c.steps[step.id];
          const bp = breakpoints?.includes(step.id) ?? false;
          return (
            <li
              key={step.id}
              data-step={step.id}
              data-status={r?.status ?? 'none'}
              className={cn(
                'flex flex-col border-b py-1.5 pr-4 text-sm',
                paused === step.id && 'bg-warning/10 ring-1 ring-inset ring-warning/40',
                fixStepId === step.id && paused !== step.id && 'bg-primary/5',
                r?.status === 'running' && 'bg-primary/5',
              )}
              style={{ paddingLeft: `${depth * 24 + 8}px` }}
            >
              <div className="flex items-center gap-2">
                {breakpoints && top ? (
                  <button
                    type="button"
                    title={tx(bp ? 'ui.run.breakpointRemove' : 'ui.run.breakpointAdd')}
                    aria-pressed={bp}
                    aria-label={tx(bp ? 'ui.run.breakpointRemove' : 'ui.run.breakpointAdd')}
                    onClick={() => onToggleBreakpoint(step.id)}
                    className="flex size-4 items-center justify-center rounded-full hover:bg-muted"
                  >
                    <span
                      className={cn('size-2 rounded-full', bp ? 'bg-fail' : 'bg-transparent')}
                    />
                  </button>
                ) : (
                  <span className="size-4" />
                )}
                <StatusIcon status={r?.status} />
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {no}
                </span>
                <div
                  className={cn('min-w-0 flex-1', !step.enabled && 'opacity-55')}
                  {...(onSelectStep
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        title: tx('ui.run.fixTitle'),
                        onClick: () => onSelectStep(step.id),
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') onSelectStep(step.id);
                        },
                      }
                    : {})}
                >
                  <StepSentence
                    step={step}
                    elements={doc?.elements ?? {}}
                    sharedNames={sharedNames}
                  />
                </div>
                {onRunTo && top && !r && paused !== step.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 shrink-0 px-2 text-xs"
                    onClick={() => onRunTo(step.id)}
                  >
                    <Play /> {tx('ui.run.runToHere')}
                  </Button>
                )}
                {r?.durationMs !== undefined && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {tx('ui.run.duration', { seconds: seconds(r.durationMs) })}
                  </span>
                )}
              </div>
              {r?.error && r.status === 'failed' && (
                <div className="mt-1 ml-[76px] rounded-md border-l-4 border-fail bg-fail/5 px-3 py-1.5">
                  <p className="font-medium">{describeRunError(r.error, tx).message}</p>
                  <p className="text-xs text-muted-foreground">
                    {describeRunError(r.error, tx).hint}
                  </p>
                  {diffOf(r.error.details) && (
                    <TableDiff diff={diffOf(r.error.details) as TableDiffView} />
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-6 px-2 text-xs"
                    onClick={() => onCopyBug(step.id)}
                  >
                    <Bug /> {tx('ui.bug.copy')}
                  </Button>
                  <CreateIssueButton build={() => onBuildIssue(step.id)} />
                </div>
              )}
              {r?.artifacts.some((a) => a.kind === 'screenshot') && (
                <div className="mt-1 ml-[76px] flex flex-wrap gap-2">
                  {r.artifacts
                    .filter((a) => a.kind === 'screenshot')
                    .map((a) => {
                      const src = artifactUrl(runId, a.path);
                      const title = tx('ui.run.screenshot', { step: r.stepNo });
                      return (
                        <button
                          type="button"
                          key={a.path}
                          onClick={() => onShot({ src, title })}
                          className="overflow-hidden rounded-md border hover:ring-2 hover:ring-primary/40"
                        >
                          <img src={src} alt={title} className="h-28 w-auto" />
                        </button>
                      );
                    })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {(videos.length > 0 || traces.length > 0) && (
        <div className="flex flex-col gap-3 p-4">
          {videos.map((v) => (
            <figure key={v.path} className="flex flex-col gap-1">
              <figcaption className="text-sm font-medium">{tx('ui.run.video')}</figcaption>
              {/* biome-ignore lint/a11y/useMediaCaption: screen recordings have no speech. */}
              <video
                controls
                src={artifactUrl(runId, v.path)}
                className="max-h-[60vh] w-full rounded-md border bg-black"
              />
            </figure>
          ))}
          {traces.map((t) => (
            <div key={t.path} className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void trpcClient.runs.openTrace
                    .mutate({ runId, path: t.path })
                    .catch(() => undefined)
                }
              >
                <FileSearch /> {tx('ui.run.trace')}
              </Button>
              <span className="text-xs text-muted-foreground">{tx('ui.run.traceHint')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

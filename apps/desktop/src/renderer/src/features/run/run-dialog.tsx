import type { TestCase } from '@kiemi/schema';
import type { StartRunInput } from '@main/run/start-input';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { Grid3x3, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useProtectedConfirm } from './confirm-protected';
import { MatrixDialog } from './matrix-dialog';
import { type RunPrefs, useRunStore } from './run-store';

/** Name of the protected environment when main asks for a confirmation. */
function protectedEnvName(err: unknown): string | undefined {
  if (!(err instanceof TRPCClientError)) return undefined;
  const data = err.data as { kiemiCode?: string; details?: { environment?: unknown } } | undefined;
  return data?.kiemiCode === 'CONFIRM_REQUIRED'
    ? String(data.details?.environment ?? '')
    : undefined;
}

export type RunTargetInput = StartRunInput['target'];

const NO_ENV = '__none__';
const DEFAULT_ENV = '__default__';
const SLOW = [0, 500, 1000, 2000];

/** Starts a run with the remembered options + the test's breakpoints, then opens the Run screen. */
export function useStartRun() {
  const tx = useTx();
  const openRun = useAppStore((s) => s.openRun);
  return async (
    target: RunTargetInput,
    extra: { startAtStepId?: string; pauseAtStart?: boolean; prefs?: RunPrefs } = {},
  ): Promise<string | undefined> => {
    const st = useRunStore.getState();
    const { environmentId, ...prefs } = extra.prefs ?? st.prefs;
    const breakpoints = target.kind === 'test' ? (st.breakpoints[target.testCaseId] ?? []) : [];
    const input = {
      target,
      ...(environmentId === undefined ? {} : { environmentId }),
      options: {
        ...prefs,
        // Hand-run single test: keep the browser open on a failed step [FX-01].
        ...(target.kind === 'test' ? { pauseOnFail: true } : {}),
        ...(breakpoints.length ? { breakpoints } : {}),
        ...(extra.startAtStepId ? { startAtStepId: extra.startAtStepId } : {}),
        ...(extra.pauseAtStart ? { pauseAtStart: true } : {}),
      },
    };
    try {
      let runId: string;
      try {
        runId = await st.start(input);
      } catch (err) {
        // Protected environment (Production): ask twice, then run [O-03, W-10].
        const name = protectedEnvName(err);
        if (name === undefined) throw err;
        if (!(await useProtectedConfirm.getState().ask(name))) return undefined;
        runId = await st.start({ ...input, confirmProtected: true });
      }
      openRun(runId);
      return runId;
    } catch (err) {
      toast.error(errorMessage(err, tx));
      return undefined;
    }
  };
}

/**
 * "Tùy chọn chạy" [H-02, H-03, H-04, I-02, I-03]: environment, run from step X,
 * slow motion, visible browser, step by step, stop on failure, screenshots/video/trace.
 */
export function RunDialog({
  open,
  onOpenChange,
  target,
  testCase,
  initialStartAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RunTargetInput;
  /** Single test: enables "run from step". */
  testCase?: TestCase | undefined;
  initialStartAt?: string | undefined;
}) {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId);
  const settings = useQuery(trpc.system.settings.queryOptions());
  const envs = useQuery({
    ...trpc.environments.list.queryOptions({ projectId: projectId ?? '' }),
    enabled: !!projectId,
  });
  const prefs = useRunStore((s) => s.prefs);
  const setPrefs = useRunStore((s) => s.setPrefs);
  const startRun = useStartRun();

  const [env, setEnv] = useState(DEFAULT_ENV);
  const [startAt, setStartAt] = useState('');
  const [slow, setSlow] = useState(0);
  const [showBrowser, setShowBrowser] = useState(true);
  const [pauseAtStart, setPauseAtStart] = useState(false);
  const [stopOnFailure, setStopOnFailure] = useState(false);
  const [shots, setShots] = useState<'onFailure' | 'always' | 'off'>('onFailure');
  const [video, setVideo] = useState(false);
  const [trace, setTrace] = useState(false);
  const [matrix, setMatrix] = useState(false);

  // Fresh form from the remembered options each time it opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setEnv(
      prefs.environmentId === undefined
        ? DEFAULT_ENV
        : prefs.environmentId === null
          ? NO_ENV
          : prefs.environmentId,
    );
    setStartAt(initialStartAt ?? '');
    setSlow(prefs.slowMoMs ?? 0);
    setShowBrowser(prefs.headless === undefined ? !settings.data?.headless : !prefs.headless);
    setPauseAtStart(false);
    setStopOnFailure(prefs.stopOnFailure ?? false);
    setShots(prefs.screenshots ?? 'onFailure');
    setVideo(prefs.video ?? false);
    setTrace(prefs.trace ?? false);
  }, [open]);

  const single = target.kind === 'test';
  const submit = async () => {
    const next: RunPrefs = {
      ...(env === DEFAULT_ENV ? {} : { environmentId: env === NO_ENV ? null : env }),
      headless: !showBrowser,
      ...(slow ? { slowMoMs: slow } : {}),
      stopOnFailure,
      screenshots: shots,
      video,
      trace,
    };
    setPrefs(next);
    onOpenChange(false);
    await startRun(target, {
      prefs: next,
      ...(startAt ? { startAtStepId: startAt } : {}),
      pauseAtStart,
    });
  };

  const row = (id: string, label: string, control: React.ReactNode, hint?: string) => (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {control}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tx('ui.run.dialog.title')}</DialogTitle>
            <DialogDescription>{tx('ui.run.dialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {row(
              'run-env',
              tx('ui.run.dialog.environment'),
              <Select value={env} onValueChange={setEnv}>
                <SelectTrigger id="run-env" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_ENV}>{envs.data?.[0]?.name ?? '—'}</SelectItem>
                  {(envs.data ?? []).slice(1).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NO_ENV}>{tx('ui.run.noEnvironment')}</SelectItem>
                </SelectContent>
              </Select>,
            )}
            {single &&
              testCase &&
              testCase.steps.length > 1 &&
              row(
                'run-start',
                tx('ui.run.dialog.startAt'),
                <Select
                  value={startAt || '__start__'}
                  onValueChange={(v) => setStartAt(v === '__start__' ? '' : v)}
                >
                  <SelectTrigger id="run-start" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__start__">{tx('ui.run.dialog.fromStart')}</SelectItem>
                    {testCase.steps.slice(1).map((s, i) => (
                      <SelectItem key={s.id} value={s.id}>
                        {`${i + 2}. ${s.name ?? tx(`ui.steps.${s.action}.label`, undefined, s.action)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>,
              )}
            {row(
              'run-slow',
              tx('ui.run.dialog.slowMo'),
              <Select value={String(slow)} onValueChange={(v) => setSlow(Number(v))}>
                <SelectTrigger id="run-slow" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOW.map((ms) => (
                    <SelectItem key={ms} value={String(ms)}>
                      {ms === 0
                        ? tx('ui.run.dialog.slowMoOff')
                        : tx('ui.run.dialog.slowMoValue', { seconds: ms / 1000 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>,
            )}
            {row(
              'run-shots',
              tx('ui.run.dialog.screenshots'),
              <Select value={shots} onValueChange={(v) => setShots(v as typeof shots)}>
                <SelectTrigger id="run-shots" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onFailure">
                    {tx('ui.run.dialog.screenshotsOnFailure')}
                  </SelectItem>
                  <SelectItem value="always">{tx('ui.run.dialog.screenshotsAlways')}</SelectItem>
                  <SelectItem value="off">{tx('ui.run.dialog.screenshotsOff')}</SelectItem>
                </SelectContent>
              </Select>,
            )}
            {row(
              'run-show',
              tx('ui.run.dialog.showBrowser'),
              <Switch id="run-show" checked={showBrowser} onCheckedChange={setShowBrowser} />,
            )}
            {single &&
              row(
                'run-pause',
                tx('ui.run.dialog.stepByStep'),
                <Switch id="run-pause" checked={pauseAtStart} onCheckedChange={setPauseAtStart} />,
              )}
            {!single &&
              row(
                'run-stop',
                tx('ui.run.dialog.stopOnFailure'),
                <Switch id="run-stop" checked={stopOnFailure} onCheckedChange={setStopOnFailure} />,
                tx('ui.run.dialog.stopOnFailureHint'),
              )}
            {row(
              'run-video',
              tx('ui.run.dialog.video'),
              <Switch id="run-video" checked={video} onCheckedChange={setVideo} />,
            )}
            {row(
              'run-trace',
              tx('ui.run.dialog.trace'),
              <Switch id="run-trace" checked={trace} onCheckedChange={setTrace} />,
            )}
          </div>
          <DialogFooter>
            {!single && (
              <Button variant="outline" className="sm:mr-auto" onClick={() => setMatrix(true)}>
                <Grid3x3 /> {tx('ui.run.matrix.open')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {tx('common.cancel')}
            </Button>
            <Button onClick={() => void submit()}>
              <Play /> {tx('ui.run.dialog.run')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MatrixDialog
        open={matrix}
        target={target}
        onOpenChange={(o) => {
          setMatrix(o);
          if (!o) onOpenChange(false);
        }}
      />
    </>
  );
}

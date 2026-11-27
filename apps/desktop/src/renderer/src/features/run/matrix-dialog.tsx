import { Button } from '@renderer/components/ui/button';
import { Checkbox } from '@renderer/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Label } from '@renderer/components/ui/label';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery } from '@tanstack/react-query';
import { Grid3x3 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useProtectedConfirm } from './confirm-protected';
import { cellView, type MatrixBrowser, type MatrixCell, matrixSummary } from './matrix';
import type { RunTargetInput } from './run-dialog';
import { RunStatusBadge } from './run-screen';
import { useRunStore } from './run-store';

const BROWSERS: MatrixBrowser[] = ['msedge', 'chrome', 'chromium'];

/** "Chạy ma trận" [O-09]: suite × environments × browsers → a table of results. */
export function MatrixDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RunTargetInput;
}) {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId);
  const openRun = useAppStore((s) => s.openRun);
  const envs = useQuery({
    ...trpc.environments.list.queryOptions({ projectId: projectId ?? '' }),
    enabled: !!projectId && open,
  });
  const runs = useRunStore((s) => s.runs);
  const [pickedEnvs, setPickedEnvs] = useState<string[]>([]);
  const [pickedBrowsers, setPickedBrowsers] = useState<MatrixBrowser[]>(['msedge']);
  const [cells, setCells] = useState<MatrixCell[] | null>(null);

  const toggle = <T extends string>(list: T[], set: (v: T[]) => void, v: T) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const start = async () => {
    const input = { target, environmentIds: pickedEnvs, browsers: pickedBrowsers };
    try {
      let res: Awaited<ReturnType<typeof trpcClient.runs.startMatrix.mutate>>;
      try {
        res = await trpcClient.runs.startMatrix.mutate(input);
      } catch (err) {
        const data = (err as { data?: { kiemiCode?: string; details?: { environment?: unknown } } })
          .data;
        if (data?.kiemiCode !== 'CONFIRM_REQUIRED') throw err;
        if (!(await useProtectedConfirm.getState().ask(String(data.details?.environment ?? ''))))
          return;
        res = await trpcClient.runs.startMatrix.mutate({ ...input, confirmProtected: true });
      }
      for (const c of res.cells) useRunStore.getState().watch(c.runId);
      setCells(res.cells);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  const envName = (id: string) => envs.data?.find((e) => e.id === id)?.name ?? id;
  const views = (cells ?? []).map((c) => cellView(c, runs[c.runId]));
  const sum = matrixSummary(views);
  const usedEnvs = [...new Set((cells ?? []).map((c) => c.environmentId))];
  const usedBrowsers = [...new Set((cells ?? []).map((c) => c.browser))];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setCells(null);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tx('ui.run.matrix.title')}</DialogTitle>
          <DialogDescription>{tx('ui.run.matrix.description')}</DialogDescription>
        </DialogHeader>
        {cells === null ? (
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                {tx('ui.run.matrix.environments')}
              </legend>
              {(envs.data ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`mx-env-${e.id}`}
                    checked={pickedEnvs.includes(e.id)}
                    onCheckedChange={() => toggle(pickedEnvs, setPickedEnvs, e.id)}
                  />
                  <Label htmlFor={`mx-env-${e.id}`}>{e.name}</Label>
                </div>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{tx('ui.run.matrix.browsers')}</legend>
              {BROWSERS.map((b) => (
                <div key={b} className="flex items-center gap-2">
                  <Checkbox
                    id={`mx-br-${b}`}
                    checked={pickedBrowsers.includes(b)}
                    onCheckedChange={() => toggle(pickedBrowsers, setPickedBrowsers, b)}
                  />
                  <Label htmlFor={`mx-br-${b}`}>{tx(`ui.run.matrix.browser.${b}`)}</Label>
                </div>
              ))}
            </fieldset>
            <p className="text-xs text-muted-foreground">
              {tx('ui.run.matrix.count', { count: pickedEnvs.length * pickedBrowsers.length })}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm" aria-live="polite">
              {tx('ui.run.matrix.summary', { passed: sum.passed, total: sum.total })}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">{tx('ui.run.matrix.environments')}</th>
                  {usedBrowsers.map((b) => (
                    <th key={b} className="py-1 pr-2 font-medium">
                      {tx(`ui.run.matrix.browser.${b}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usedEnvs.map((id) => (
                  <tr key={id} className="border-t">
                    <td className="py-2 pr-2">{envName(id)}</td>
                    {usedBrowsers.map((b) => {
                      const v = views.find(
                        (x) => x.cell.environmentId === id && x.cell.browser === b,
                      );
                      return (
                        <td key={b} className="py-2 pr-2">
                          {v && (
                            <button
                              type="button"
                              className="flex items-center gap-2"
                              onClick={() => {
                                onOpenChange(false);
                                openRun(v.cell.runId);
                              }}
                            >
                              <RunStatusBadge status={v.status} />
                              {v.total > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {v.passed}/{v.total}
                                </span>
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tx(cells === null ? 'common.cancel' : 'ui.run.matrix.close')}
          </Button>
          {cells === null && (
            <Button
              disabled={pickedEnvs.length === 0 || pickedBrowsers.length === 0}
              onClick={() => void start()}
            >
              <Grid3x3 /> {tx('ui.run.matrix.run')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

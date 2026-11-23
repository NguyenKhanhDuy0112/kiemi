import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { errorMessage } from '@renderer/lib/errors';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { cn } from '@renderer/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { describeFolderPath } from './folder-notices';
import type { useProjectFolder } from './project-folder';

type Status = NonNullable<ReturnType<typeof useProjectFolder>>;
type Side = 'local' | 'remote';

/** Conflict + missing-secret dialogs for the current project's folder [T-01, O-11]. */
export function ProjectFolderDialogs({ status }: { status: Status | null }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dismiss = (key: string) => setDismissed((d) => new Set(d).add(key));
  const conflictKey = status ? `${status.projectId}:${status.conflicts.join('|')}` : '';
  const secretsKey = status
    ? `${status.projectId}:${status.missingSecrets.map((m) => `${m.environmentId}=${m.names.join(',')}`).join(';')}`
    : '';
  const showConflicts = !!status && status.conflicts.length > 0 && !dismissed.has(conflictKey);
  const showSecrets =
    !!status && !showConflicts && status.missingSecrets.length > 0 && !dismissed.has(secretsKey);
  return (
    <>
      {showConflicts && status ? (
        <ConflictDialog status={status} onClose={() => dismiss(conflictKey)} />
      ) : null}
      {showSecrets && status ? (
        <SecretsDialog status={status} onClose={() => dismiss(secretsKey)} />
      ) : null}
    </>
  );
}

function ConflictDialog({ status, onClose }: { status: Status; onClose: () => void }) {
  const tx = useTx();
  const qc = useQueryClient();
  const [choices, setChoices] = useState<Record<string, Side>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setChoices(Object.fromEntries(status.conflicts.map((p) => [p, 'local' as Side])));
  }, [status.conflicts]);
  const all = (side: Side) =>
    setChoices(Object.fromEntries(status.conflicts.map((p) => [p, side])));
  const apply = async () => {
    setBusy(true);
    try {
      await trpcClient.projects.resolveConflicts.mutate({ id: status.projectId, choices });
      await qc.invalidateQueries();
      toast.success(tx('ui.projectFolder.resolved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tx('ui.projectFolder.conflictTitle')}</DialogTitle>
          <DialogDescription>{tx('ui.projectFolder.conflictText')}</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {status.conflicts.map((path) => (
            <li
              key={path}
              className="flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm" title={path}>
                {describeFolderPath(path, tx)}
              </span>
              <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={path}>
                {(['local', 'remote'] as const).map((side) => (
                  <Button
                    key={side}
                    type="button"
                    size="sm"
                    role="radio"
                    aria-checked={choices[path] === side}
                    variant={choices[path] === side ? 'default' : 'outline'}
                    className={cn(choices[path] !== side && 'text-muted-foreground')}
                    onClick={() => setChoices((c) => ({ ...c, [path]: side }))}
                  >
                    {tx(
                      side === 'local' ? 'ui.projectFolder.keepApp' : 'ui.projectFolder.takeFolder',
                    )}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => all('local')}>
              {tx('ui.projectFolder.keepAllApp')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => all('remote')}>
              {tx('ui.projectFolder.takeAllFolder')}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tx('ui.projectFolder.later')}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void apply()}>
              {tx('ui.projectFolder.apply')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretsDialog({ status, onClose }: { status: Status; onClose: () => void }) {
  const tx = useTx();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const key = (envId: string, name: string) => `${envId}\u0000${name}`;
  const save = async () => {
    setBusy(true);
    let count = 0;
    try {
      for (const m of status.missingSecrets) {
        for (const name of m.names) {
          const value = values[key(m.environmentId, name)];
          if (!value) continue;
          await trpcClient.environments.setSecret.mutate({ id: m.environmentId, name, value });
          count++;
        }
      }
      await qc.invalidateQueries({
        queryKey: trpc.projects.folder.queryKey({ id: status.projectId }),
      });
      await qc.invalidateQueries({ queryKey: trpc.environments.get.queryKey() });
      if (count) toast.success(tx('ui.projectFolder.secretsSaved', { count }));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <DialogHeader>
            <DialogTitle>{tx('ui.projectFolder.secretsTitle')}</DialogTitle>
            <DialogDescription>{tx('ui.projectFolder.secretsText')}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-80 flex-col gap-4 overflow-y-auto">
            {status.missingSecrets.map((m) => (
              <fieldset key={m.environmentId} className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold">{m.environment}</legend>
                {m.names.map((name) => {
                  const id = `secret-${m.environmentId}-${name}`;
                  return (
                    <div key={name} className="flex flex-col gap-1.5">
                      <Label htmlFor={id}>{name}</Label>
                      <Input
                        id={id}
                        type="password"
                        autoComplete="off"
                        value={values[key(m.environmentId, name)] ?? ''}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [key(m.environmentId, name)]: e.target.value }))
                        }
                      />
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tx('ui.projectFolder.later')}
            </Button>
            <Button type="submit" disabled={busy}>
              {tx('ui.actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

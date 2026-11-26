import { expectedError, type FormCase, type FormSpec, generateFormCases } from '@kiemi/schema';
import { Badge } from '@renderer/components/ui/badge';
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
import { errorMessage } from '@renderer/lib/errors';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

/**
 * The cases generated for a saved form [R-03]: the tester unticks / ticks, then
 * creates the tests (one folder named after the form).
 */
export function GenerateDialog({
  projectId,
  form,
  onClose,
}: {
  projectId: string;
  form: FormSpec;
  onClose: () => void;
}) {
  const tx = useTx();
  const qc = useQueryClient();
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const catalog = project.data?.messageCatalog ?? {};
  const cases = useMemo(() => generateFormCases(form), [form]);
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(cases.filter((c) => c.selected).map((c) => c.id)),
  );
  const [busy, setBusy] = useState(false);

  const toggle = (c: FormCase) =>
    setTicked((t) => {
      const next = new Set(t);
      if (!next.delete(c.id)) next.add(c.id);
      return next;
    });

  const create = async () => {
    setBusy(true);
    try {
      const r = await trpcClient.forms.generateTests.mutate({
        projectId,
        formId: form.id,
        caseIds: [...ticked],
      });
      await qc.invalidateQueries({ queryKey: trpc.testCases.list.queryKey({ projectId }) });
      await qc.invalidateQueries({ queryKey: trpc.folders.list.queryKey({ projectId }) });
      toast.success(tx('ui.forms.generated', { created: r.created, skipped: r.skipped }));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tx('ui.forms.generateTitle', { name: form.name })}</DialogTitle>
          <DialogDescription>
            {tx('ui.forms.generateHint', { count: cases.length })}
          </DialogDescription>
        </DialogHeader>
        <ul
          className="max-h-[50vh] divide-y overflow-auto rounded-md border"
          data-testid="case-list"
        >
          {cases.map((c) => {
            const message = expectedError(form, c, catalog);
            return (
              <li key={c.id} className="flex items-start gap-3 p-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={ticked.has(c.id)}
                  aria-label={c.name}
                  onCheckedChange={() => toggle(c)}
                />
                <div className="min-w-0 flex-1">
                  <div>{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.why}
                    {message ? ` — ${tx('ui.forms.expects', { message })}` : ''}
                  </div>
                </div>
                <Badge variant="outline">{tx(`ui.forms.techniques.${c.technique}`)}</Badge>
                <Badge variant={c.expect === 'reject' ? 'destructive' : 'secondary'}>
                  {tx(`ui.forms.expectKinds.${c.expect}`)}
                </Badge>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {tx('common.cancel')}
          </Button>
          <Button disabled={busy || ticked.size === 0} onClick={() => void create()}>
            {tx('ui.forms.createTests', { count: ticked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

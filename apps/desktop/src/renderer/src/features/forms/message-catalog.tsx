import { DEFAULT_MESSAGES, type MessageCatalog } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { errorMessage } from '@renderer/lib/errors';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, MessageSquareWarning } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { changedMessages } from './catalog-edit';

/**
 * "Thông báo lỗi chuẩn": the wording the project expects for each rule — the
 * source for checking error messages of generated tests [R-10, R-05].
 */
export function MessageCatalogEditor({ projectId }: { projectId: string }) {
  const tx = useTx();
  const qc = useQueryClient();
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const stored = project.data?.messageCatalog;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MessageCatalog>({});
  useEffect(() => setDraft(stored ?? {}), [stored]);
  const dirty = JSON.stringify(changedMessages(draft)) !== JSON.stringify(stored ?? {});

  const save = async () => {
    try {
      await trpcClient.projects.setMessageCatalog.mutate({
        id: projectId,
        messages: changedMessages(draft),
      });
      await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <section className="rounded-lg border p-4" data-testid="message-catalog">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-sm font-semibold"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <MessageSquareWarning className="size-4 text-muted-foreground" aria-hidden />
        {tx('ui.forms.catalog')}
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{tx('ui.forms.catalogHint')}</p>
          {Object.entries(DEFAULT_MESSAGES).map(([key, def]) => (
            <div key={key} className="grid items-center gap-2 md:grid-cols-12">
              <span className="text-xs text-muted-foreground md:col-span-3">{key}</span>
              <Input
                className="md:col-span-9"
                aria-label={key}
                value={draft[key] ?? ''}
                placeholder={def}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <Button size="sm" disabled={!dirty} onClick={() => void save()}>
              {tx('common.save')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

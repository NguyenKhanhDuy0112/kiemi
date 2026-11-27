import { isTracker } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

/** Files the failed step as an issue in a tracker the project has set up [X-02]. */
export function CreateIssueButton({
  build,
}: {
  build: () => { title: string; body: string } | null;
}) {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const channels = useQuery({
    ...trpc.notify.list.queryOptions({ projectId }),
    enabled: !!projectId,
  });
  const trackers = (channels.data ?? []).filter((c) => isTracker(c.kind) && c.enabled);

  const create = async (channelId: string) => {
    const issue = build();
    if (!issue) return;
    try {
      const r = await trpcClient.issues.create.mutate({ channelId, ...issue });
      if (r.ok) {
        toast.success(tx('ui.bug.issueCreated'), r.url ? { description: r.url } : {});
        if (r.url) await navigator.clipboard.writeText(r.url).catch(() => undefined);
      } else toast.error(tx('ui.bug.issueFailed', { reason: r.message }));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  if (trackers.length === 0) return null;
  const one = trackers.length === 1 ? trackers[0] : undefined;
  if (one)
    return (
      <Button
        size="sm"
        variant="ghost"
        className="mt-1 h-6 px-2 text-xs"
        onClick={() => void create(one.id)}
      >
        <Send /> {tx('ui.bug.createIssue')}
      </Button>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="mt-1 h-6 px-2 text-xs">
          <Send /> {tx('ui.bug.createIssue')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{tx('ui.bug.issueIn')}</DropdownMenuLabel>
        {trackers.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => void create(t.id)}>
            {t.name} · {tx(`ui.notify.kind.${t.kind}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

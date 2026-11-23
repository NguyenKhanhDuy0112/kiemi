import { errorMessage } from '@renderer/lib/errors';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { folderNotices, type Tx } from './folder-notices';

let following = false;

/**
 * Teammates' changes loaded from the project folder → refetch what is on screen
 * (another machine's edit shows up in ≤ 5 s) [T-01].
 */
function followFolderEvents(qc: QueryClient): void {
  if (following) return;
  following = true;
  trpcClient.projects.folderEvents.subscribe(undefined, {
    onData: (e) => {
      if (e.kind === 'loaded') void qc.invalidateQueries();
      else
        void qc.invalidateQueries({ queryKey: trpc.projects.folder.queryKey({ id: e.projectId }) });
    },
    onError: () => {
      following = false;
    },
  });
}

/** Folder status of the current project; shows each notice once. */
export function useProjectFolder(projectId: string | null, tx: Tx) {
  const qc = useQueryClient();
  useEffect(() => followFolderEvents(qc), [qc]);
  const status = useQuery({
    ...trpc.projects.folder.queryOptions({ id: projectId ?? '' }),
    enabled: !!projectId,
  });
  const shown = useRef(new Set<string>());
  useEffect(() => {
    if (!status.data) return;
    for (const n of folderNotices(status.data, tx)) {
      if (shown.current.has(n.key)) continue;
      shown.current.add(n.key);
      const retry =
        n.key.startsWith('missing:') && projectId
          ? {
              action: {
                label: tx('ui.projectFolder.retry'),
                onClick: () => void retrySync(qc, projectId, tx),
              },
            }
          : {};
      if (n.level === 'warning') toast.warning(n.text, retry);
      else toast.info(n.text);
    }
  }, [status.data, tx, qc, projectId]);
  return status.data ?? null;
}

async function retrySync(qc: QueryClient, projectId: string, tx: Tx) {
  try {
    await trpcClient.projects.syncFolder.mutate({ id: projectId });
    await qc.invalidateQueries();
  } catch (err) {
    toast.error(errorMessage(err, tx));
  }
}

/** "Open project folder…": native picker, then switch to it. */
export async function openProjectFolder(
  qc: QueryClient,
  tx: Tx,
  setProject: (id: string) => void,
): Promise<void> {
  try {
    const status = await trpcClient.projects.openFolder.mutate({
      title: tx('ui.projectFolder.pickTitle'),
    });
    if (!status) return;
    // Everything may have changed (tests, environments…).
    await qc.invalidateQueries();
    const project = await trpcClient.projects.get.query({ id: status.projectId });
    setProject(project.id);
    toast.success(tx('ui.projectFolder.opened', { name: project.name }));
  } catch (err) {
    toast.error(errorMessage(err, tx));
  }
}

import type { Locator, TestCase } from '@kiemi/schema';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Globe, Layers, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { refFromName } from './elements-screen';

/** Tests that would feel a change to a workspace step, grouped by project [O-07, FX-08]. */
function Impact({ sharedStepId }: { sharedStepId: string }) {
  const tx = useTx();
  const openTest = useAppStore((s) => s.openTest);
  const usages = useQuery(trpc.sharedResources.usages.queryOptions({ sharedStepId }));
  const groups = usages.data ?? [];
  if (groups.length === 0)
    return <p className="mt-2 text-xs text-muted-foreground">{tx('ui.library.unused')}</p>;
  const total = groups.reduce((n, g) => n + g.tests.length, 0);
  return (
    <div className="mt-2 text-xs">
      <p className="font-medium text-warning-text">
        {tx('ui.library.impact', { tests: total, projects: groups.length })}
      </p>
      <ul className="mt-1 flex flex-col gap-1 text-muted-foreground">
        {groups.map((g) => (
          <li key={g.projectId}>
            <span className="font-medium">{g.projectName}:</span>{' '}
            {g.tests.map((t) => (
              <button
                key={t.id}
                type="button"
                className="mr-2 underline"
                onClick={() => openTest(t.id)}
              >
                {t.name}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Dùng chéo dự án": the workspace library of steps and elements [O-07]. */
export function SharedLibrary({
  projectId,
  projectElements,
  testDoc,
  onSaveDoc,
}: {
  projectId: string;
  projectElements: { id: string; name: string; locator: Locator; pageUrl: string | null }[];
  testDoc: TestCase | undefined;
  onSaveDoc: (doc: TestCase) => void;
}) {
  const tx = useTx();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const projectSteps = useQuery(trpc.sharedSteps.list.queryOptions({ projectId }));
  const library = useQuery(trpc.sharedResources.list.queryOptions({}));
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.sharedResources.list.queryKey({}) });
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      await refresh();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const libSteps = (library.data ?? []).filter((r) => r.kind === 'shared_step');
  const libElements = (library.data ?? []).filter((r) => r.kind === 'element');

  return (
    <section aria-labelledby="lib-title" className="border-t p-4 lg:col-span-2">
      <h2 id="lib-title" className="flex items-center gap-2 text-sm font-semibold">
        <Globe className="size-4" aria-hidden /> {tx('ui.library.title')}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">{tx('ui.library.hint')}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
            {tx('ui.library.projectSteps')}
          </h3>
          {(projectSteps.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">{tx('ui.library.noSteps')}</p>
          )}
          <ul className="flex flex-col gap-2">
            {(projectSteps.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg border p-3">
                <Layers className="size-4 text-muted-foreground" aria-hidden />
                <span className="flex-1 truncate text-sm font-medium">{s.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    run(
                      () =>
                        trpcClient.sharedResources.promoteSharedStep.mutate({ sharedStepId: s.id }),
                      tx('ui.library.shared'),
                    )
                  }
                >
                  <Globe /> {tx('ui.library.useAcross')}
                </Button>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 mb-2 text-xs font-semibold text-muted-foreground uppercase">
            {tx('ui.library.projectElements')}
          </h3>
          <ul className="flex flex-col gap-2">
            {projectElements.map((el) => (
              <li key={el.id} className="flex items-center gap-2 rounded-lg border p-3">
                <span className="flex-1 truncate text-sm font-medium">{el.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    run(
                      () =>
                        trpcClient.sharedResources.create.mutate({
                          kind: 'element',
                          scope: 'workspace',
                          name: el.name,
                          data: { locator: el.locator, pageUrl: el.pageUrl },
                        }),
                      tx('ui.library.shared'),
                    )
                  }
                >
                  <Globe /> {tx('ui.library.useAcross')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
            {tx('ui.library.workspaceSteps')}
          </h3>
          {libSteps.length + libElements.length === 0 && (
            <p className="text-sm text-muted-foreground">{tx('ui.library.empty')}</p>
          )}
          <ul className="flex flex-col gap-2">
            {libSteps.map((r) => (
              <li key={r.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 text-left"
                    aria-expanded={open === r.id}
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                  >
                    {open === r.id ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                    <span className="truncate text-sm font-medium">{r.name}</span>
                  </button>
                  <Badge variant="secondary">{tx('ui.library.step')}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={tx('ui.actions.delete')}
                    onClick={() =>
                      run(() => trpcClient.sharedResources.remove.mutate({ id: r.id }))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
                {open === r.id && <Impact sharedStepId={r.id} />}
              </li>
            ))}
            {libElements.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border p-3">
                <span className="flex-1 truncate text-sm font-medium">{r.name}</span>
                <Badge variant="secondary">{tx('ui.library.element')}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!testDoc}
                  onClick={() => {
                    if (!testDoc) return;
                    const content = structuredClone(testDoc);
                    const ref = refFromName(r.name, new Set(Object.keys(content.elements)));
                    const { locator } = r.data as { locator: Locator };
                    content.elements[ref] = { ...locator, name: r.name };
                    onSaveDoc(content);
                  }}
                >
                  <Plus /> {tx('ui.elements.copyToTest')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tx('ui.actions.delete')}
                  onClick={() => run(() => trpcClient.sharedResources.remove.mutate({ id: r.id }))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

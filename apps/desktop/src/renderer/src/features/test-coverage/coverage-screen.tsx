import { PAGE_KINDS, type PageDecl, type PageKind } from '@kiemi/schema';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { cn } from '@renderer/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Gauge, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RequirementsPanel } from './requirements-panel';

/** "Độ phủ": declared pages vs tests, checklist per page kind, labels by technique / quality [CV-01, CV-02, CV-04]. */
export function CoverageScreen() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const coverage = useQuery(trpc.coverage.get.queryOptions({ projectId }));
  const stored = project.data?.pages;
  const [pages, setPages] = useState<PageDecl[]>([]);
  useEffect(() => setPages(stored ?? []), [stored]);
  const dirty = JSON.stringify(pages) !== JSON.stringify(stored ?? []);
  const patch = (id: string, p: Partial<PageDecl>) =>
    setPages((ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const save = async () => {
    try {
      await trpcClient.projects.setPages.mutate({ id: projectId, pages });
      await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
      await qc.invalidateQueries({ queryKey: trpc.coverage.get.queryKey({ projectId }) });
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  const cov = coverage.data;
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="coverage-screen"
    >
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Gauge className="size-5 text-muted-foreground" aria-hidden />
          {tx('ui.coverage.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{tx('ui.coverage.hint')}</p>
      </header>
      <RequirementsPanel />

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-semibold">{tx('ui.coverage.pages')}</h2>
        <div className="flex flex-col gap-2">
          {pages.length === 0 && (
            <p className="text-sm text-muted-foreground">{tx('ui.coverage.noPages')}</p>
          )}
          {pages.map((p) => (
            <div key={p.id} className="grid items-center gap-2 md:grid-cols-12">
              <Input
                className="md:col-span-4"
                aria-label={tx('ui.coverage.pageName')}
                value={p.name}
                placeholder={tx('ui.coverage.pageName')}
                onChange={(e) => patch(p.id, { name: e.target.value })}
              />
              <Input
                className="md:col-span-4"
                aria-label={tx('ui.coverage.pagePath')}
                value={p.path}
                placeholder={tx('ui.forms.pathHint')}
                onChange={(e) => patch(p.id, { path: e.target.value })}
              />
              <div className="md:col-span-3">
                <Select value={p.kind} onValueChange={(v) => patch(p.id, { kind: v as PageKind })}>
                  <SelectTrigger aria-label={tx('ui.coverage.pageKind')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {tx(`ui.coverage.kinds.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={tx('ui.coverage.removePage')}
                onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setPages((ps) => [
                  ...ps,
                  { id: `page-${Date.now().toString(36)}`, name: '', path: '', kind: 'other' },
                ])
              }
            >
              <Plus /> {tx('ui.coverage.addPage')}
            </Button>
            <Button
              size="sm"
              disabled={!dirty || pages.some((p) => !p.name.trim() || !p.path.trim())}
              onClick={() => void save()}
            >
              {tx('common.save')}
            </Button>
          </div>
        </div>
      </section>

      {cov && cov.pages.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-semibold">
            {tx('ui.coverage.result', {
              tested: cov.pages.length - cov.untested.length,
              total: cov.pages.length,
            })}
          </h2>
          <ul className="flex flex-col gap-2" data-testid="coverage-pages">
            {cov.pages.map((r) => (
              <li key={r.page.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2">
                  {r.tests.length > 0 ? (
                    <Check className="size-4 text-pass" aria-hidden />
                  ) : (
                    <X className="size-4 text-fail" aria-hidden />
                  )}
                  <span className="font-medium">{r.page.name}</span>
                  <span className="text-xs text-muted-foreground">{r.page.path}</span>
                  <Badge
                    variant={r.tests.length > 0 ? 'secondary' : 'destructive'}
                    className="ml-auto"
                  >
                    {r.tests.length > 0
                      ? tx('ui.coverage.testCount', { count: r.tests.length })
                      : tx('ui.coverage.untested')}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.groups.map((g) => (
                    <Badge
                      key={g.group}
                      variant="outline"
                      className={cn(g.covered ? 'text-pass' : 'text-muted-foreground')}
                    >
                      {g.covered ? '✓' : '○'} {tx(`ui.coverage.groups.${g.group}`)}
                    </Badge>
                  ))}
                </div>
                {r.groups.some((g) => !g.covered) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tx('ui.coverage.missing', {
                      groups: r.groups
                        .filter((g) => !g.covered)
                        .map((g) => tx(`ui.coverage.groups.${g.group}`))
                        .join(', '),
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cov && (
        <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-semibold">{tx('ui.coverage.byTechnique')}</h2>
            <ul className="text-sm">
              {cov.byTechnique.map((x) => (
                <li key={x.key} className="flex justify-between">
                  <span>{tx(`ui.labels.techniques.${x.key}`)}</span>
                  <span className={cn(x.count === 0 && 'text-muted-foreground')}>{x.count}</span>
                </li>
              ))}
              <li className="flex justify-between text-muted-foreground">
                <span>{tx('ui.coverage.unlabelled')}</span>
                <span>{cov.unlabelled}</span>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">{tx('ui.coverage.byQuality')}</h2>
            <ul className="text-sm">
              {cov.byQuality.map((x) => (
                <li key={x.key} className="flex justify-between">
                  <span>{tx(`ui.labels.qualities.${x.key}`)}</span>
                  <span className={cn(x.count === 0 && 'text-muted-foreground')}>{x.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

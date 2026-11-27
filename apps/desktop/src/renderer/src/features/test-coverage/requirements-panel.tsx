import { parseRequirements, type Requirement } from '@kiemi/schema';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Textarea } from '@renderer/components/ui/textarea';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { cn } from '@renderer/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

const TONE: Record<string, string> = {
  none: 'bg-red-500/15 text-red-700 dark:text-red-400',
  untested: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  passing: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  failing: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

/** Requirements / tickets and the tests linked by the tag `req:<key>` [T-04, CV-05]. */
export function RequirementsPanel() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const cov = useQuery(trpc.coverage.requirements.queryOptions({ projectId }));
  const [text, setText] = useState('');
  const stored: Requirement[] = project.data?.requirements ?? [];

  const save = async (next: Requirement[]) => {
    try {
      await trpcClient.projects.setRequirements.mutate({ id: projectId, requirements: next });
      await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
      await qc.invalidateQueries({ queryKey: trpc.coverage.requirements.queryKey({ projectId }) });
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const add = async () => {
    const have = new Set(stored.map((r) => r.key.toLowerCase()));
    const fresh = parseRequirements(text).filter((r) => !have.has(r.key.toLowerCase()));
    await save([...stored, ...fresh]);
    setText('');
  };
  const c = cov.data;

  return (
    <section className="flex flex-col gap-3" data-testid="requirements-panel">
      <h2 className="text-base font-semibold">{tx('ui.requirements.title')}</h2>
      <p className="text-sm text-muted-foreground">{tx('ui.requirements.hint')}</p>
      {c && c.coveredPercent !== null && (
        <p className="text-sm" data-testid="requirements-summary">
          {tx('ui.requirements.summary', { covered: c.coveredPercent, passing: c.passingPercent })}
        </p>
      )}
      {c && c.rows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {c.rows.map((r) => (
            <li key={r.requirement.key} className="flex flex-col gap-1 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{r.requirement.key}</span>
                <span className="min-w-0 flex-1 truncate">{r.requirement.title}</span>
                <Badge variant="outline" className={cn(TONE[r.state])}>
                  {tx(`ui.requirements.state.${r.state}`)}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void save(stored.filter((x) => x.key !== r.requirement.key))}
                >
                  {tx('ui.actions.delete')}
                </Button>
              </div>
              {r.tests.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {r.tests.map((t) => t.name).join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {c && c.unknownKeys.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {tx('ui.requirements.unknown', { keys: c.unknownKeys.join(', ') })}
        </p>
      )}
      <Textarea
        rows={3}
        value={text}
        aria-label={tx('ui.requirements.title')}
        placeholder={tx('ui.requirements.example')}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        size="sm"
        className="self-start"
        disabled={text.trim() === ''}
        onClick={() => void add()}
      >
        {tx('ui.requirements.add')}
      </Button>
    </section>
  );
}

import { type LintWarning, lintTest, removeStep, type TestCase } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover';
import { useAppStore } from '@renderer/lib/store';
import { trpc } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useEditorStore } from './editor-store';

/** "Chất lượng test": warnings with a reason and, when possible, a quick fix [CV-07]. */
export function QualityButton({ doc }: { doc: TestCase }) {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const sigs = useQuery({
    ...trpc.coverage.signatures.queryOptions({ projectId }),
    staleTime: 30_000,
  });
  const warnings = useMemo(() => lintTest(doc, sigs.data ?? {}), [doc, sigs.data]);

  const fix = (w: LintWarning) => {
    if (w.fix.kind !== 'removeStep') return;
    const id = w.fix.stepId;
    useEditorStore.getState().apply((d) => removeStep(d, id));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={tx('ui.lint.title')}
          data-testid="quality-button"
        >
          {warnings.length === 0 ? (
            <ShieldCheck className="text-pass" />
          ) : (
            <TriangleAlert className="text-warning" />
          )}
          {warnings.length > 0 && <span>{warnings.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <h2 className="mb-2 text-sm font-semibold">{tx('ui.lint.title')}</h2>
        {warnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx('ui.lint.clean')}</p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-2 overflow-auto">
            {warnings.map((w) => (
              <li key={`${w.rule}-${w.stepId ?? ''}`} className="rounded-md border p-2 text-sm">
                <div className="font-medium">{tx(`ui.lint.rules.${w.rule}.title`)}</div>
                <p className="text-xs text-muted-foreground">
                  {tx(`ui.lint.rules.${w.rule}.why`, w.params)}
                </p>
                {w.fix.kind === 'removeStep' && (
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => fix(w)}>
                    {tx('ui.lint.removeStep')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

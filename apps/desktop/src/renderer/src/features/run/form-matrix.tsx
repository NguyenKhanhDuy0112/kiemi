import { buildMatrix, type CaseOutcome, type FormSpec, type MatrixCell } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { errorMessage } from '@renderer/lib/errors';
import { trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { cn } from '@renderer/lib/utils';
import { Check, Download, Minus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { matrixTable } from './form-outcomes';

const ICON = { pass: Check, fail: X, none: Minus } as const;
const TONE = {
  pass: 'bg-pass-soft text-pass',
  fail: 'bg-fail-soft text-fail',
  none: 'text-muted-foreground',
} as const;

/**
 * Field × rule matrix of the form tests of a run: ✓ / ✗ / –, click a cell to see
 * its cases and open one; export to Excel [R-09].
 */
export function FormMatrixView({
  form,
  outcomes,
  onOpenCase,
}: {
  form: FormSpec;
  outcomes: CaseOutcome[];
  onOpenCase: (ref: string) => void;
}) {
  const tx = useTx();
  const matrix = useMemo(() => buildMatrix(form, outcomes), [form, outcomes]);
  const [open, setOpen] = useState<{ row: number; col: string } | null>(null);
  const rule = (k: string) => tx(`ui.forms.matrix.rules.${k}`);
  const cell: MatrixCell | undefined = open ? matrix.rows[open.row]?.cells[open.col] : undefined;

  const exportExcel = async () => {
    try {
      const table = matrixTable(matrix, {
        field: tx('ui.forms.matrix.field'),
        wholeForm: tx('ui.forms.matrix.wholeForm'),
        rule,
      });
      const r = await trpcClient.forms.tableToExcel.mutate({
        ...table,
        sheetName: form.name.slice(0, 30),
      });
      const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `kiemi-${form.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-ma-tran.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(tx('ui.forms.matrix.exported'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <section className="border-b p-3" data-testid="form-matrix">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">
          {tx('ui.forms.matrix.title', { name: form.name })}
        </h2>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => void exportExcel()}>
          <Download /> {tx('ui.forms.matrix.export')}
        </Button>
      </div>
      <div className="overflow-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="p-1 text-left font-medium">{tx('ui.forms.matrix.field')}</th>
              {matrix.columns.map((c) => (
                <th key={c} className="p-1 text-center text-xs font-medium">
                  {rule(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((r, i) => (
              <tr key={r.field?.key ?? '_form'}>
                <td className="p-1 pr-3">{r.field?.label ?? tx('ui.forms.matrix.wholeForm')}</td>
                {matrix.columns.map((c) => {
                  const cl = r.cells[c];
                  const status = cl?.status ?? 'none';
                  const Icon = ICON[status];
                  return (
                    <td key={c} className="p-0.5 text-center">
                      <button
                        type="button"
                        disabled={status === 'none'}
                        aria-label={`${r.field?.label ?? tx('ui.forms.matrix.wholeForm')} — ${rule(c)}: ${tx(`ui.forms.matrix.status.${status}`)}`}
                        data-status={status}
                        onClick={() => setOpen({ row: i, col: c })}
                        className={cn(
                          'inline-flex size-8 items-center justify-center rounded-md',
                          TONE[status],
                          open?.row === i && open.col === c && 'ring-2 ring-ring',
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cell && cell.cases.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {cell.cases.map((c) => (
            <li key={c.ref} className="flex items-center gap-2">
              {c.passed ? (
                <Check className="size-4 text-pass" aria-hidden />
              ) : (
                <X className="size-4 text-fail" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">
                {c.caseId}
                {c.failedChecks.length > 0 && (
                  <span className="text-muted-foreground"> — {c.failedChecks.join('; ')}</span>
                )}
              </span>
              <Button size="sm" variant="ghost" onClick={() => onOpenCase(c.ref)}>
                {tx('ui.forms.matrix.open')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

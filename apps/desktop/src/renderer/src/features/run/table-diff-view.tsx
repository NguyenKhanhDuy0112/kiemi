import { useTx } from '@renderer/lib/tx';
import type { TableDiffView } from './table-diff';

/** Missing / extra rows and the cells that differ, in red [P-06]. */
export function TableDiff({ diff }: { diff: TableDiffView }) {
  const tx = useTx();
  const list = (label: string, items: string[]) =>
    items.length ? (
      <p>
        <span className="font-medium">{label}</span> ({items.length}):{' '}
        {items.slice(0, 20).join(', ')}
        {items.length > 20 ? ', …' : ''}
      </p>
    ) : null;
  return (
    <div className="mt-2 flex flex-col gap-1 text-xs" data-testid="table-diff">
      {list(tx('ui.run.diff.missing'), diff.missing)}
      {list(tx('ui.run.diff.extra'), diff.extra)}
      {list(tx('ui.run.diff.duplicates'), diff.duplicates)}
      {diff.mismatched.length > 0 && (
        <table className="w-full max-w-xl border-collapse">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="p-1 font-normal">{tx('ui.run.diff.key')}</th>
              <th className="p-1 font-normal">{tx('ui.run.diff.column')}</th>
              <th className="p-1 font-normal">{tx('ui.run.diff.expected')}</th>
              <th className="p-1 font-normal">{tx('ui.run.diff.actual')}</th>
            </tr>
          </thead>
          <tbody>
            {diff.mismatched.slice(0, 50).map((m) => (
              <tr key={`${m.key}|${m.column}`} className="border-t">
                <td className="p-1">{m.key}</td>
                <td className="p-1">{m.column}</td>
                <td className="p-1">{m.expected}</td>
                <td className="bg-fail/15 p-1 font-medium text-fail-text">{m.actual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

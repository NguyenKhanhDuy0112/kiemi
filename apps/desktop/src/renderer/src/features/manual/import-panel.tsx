import type { ManualCase } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { fileToBase64 } from '@renderer/features/editor/editor-tabs';
import { errorMessage } from '@renderer/lib/errors';
import { trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const FIELDS = ['id', 'name', 'group', 'priority', 'preconditions', 'action', 'expected'] as const;
type Field = (typeof FIELDS)[number];

interface Preview {
  columns: string[];
  mapping: Partial<Record<Field, string>>;
  cases: ManualCase[];
  warnings: string[];
}

/** Import of test cases from an Excel file: pick file, check the column map, import [X-08]. */
export function ImportPanel({ onImport }: { onImport: (cases: ManualCase[]) => void }) {
  const tx = useTx();
  const [data, setData] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const read = async (base64: string, mapping?: Preview['mapping']) => {
    try {
      const r = await trpcClient.manual.preview.mutate({
        data: base64,
        ...(mapping
          ? { mapping: { ...Object.fromEntries(FIELDS.map((f) => [f, ''])), ...mapping } }
          : {}),
      });
      setPreview(r as Preview);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const downloadTemplate = async () => {
    try {
      const r = await trpcClient.manual.template.query();
      const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kiemi-case-thu-cong-mau.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-md border p-3" data-testid="manual-import">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
        {tx('ui.manual.import.title')}
      </h2>
      <p className="text-xs text-muted-foreground">{tx('ui.manual.import.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".xlsx"
          aria-label={tx('ui.manual.import.pick')}
          className="text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void fileToBase64(file).then((b) => {
              setData(b);
              void read(b);
            });
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => void downloadTemplate()}>
          <Download /> {tx('ui.manual.import.template')}
        </Button>
      </div>
      {preview && data && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <span className="w-36 shrink-0">{tx(`ui.manual.import.field.${f}`)}</span>
                <select
                  className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2"
                  value={preview.mapping[f] ?? ''}
                  onChange={(e) => {
                    const next = { ...preview.mapping, [f]: e.target.value };
                    void read(data, next);
                  }}
                >
                  <option value="">{tx('ui.manual.import.none')}</option>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {preview.warnings.length > 0 && (
            <ul className="text-xs text-amber-700 dark:text-amber-400">
              {preview.warnings.slice(0, 8).map((w) => (
                <li key={w}>{w}</li>
              ))}
              {preview.warnings.length > 8 && (
                <li>
                  {tx('ui.manual.import.moreWarnings', { count: preview.warnings.length - 8 })}
                </li>
              )}
            </ul>
          )}
          <div>
            <Button
              size="sm"
              disabled={preview.cases.length === 0}
              onClick={() => {
                onImport(preview.cases);
                setPreview(null);
                setData(null);
              }}
            >
              {tx('ui.manual.import.apply', { count: preview.cases.length })}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

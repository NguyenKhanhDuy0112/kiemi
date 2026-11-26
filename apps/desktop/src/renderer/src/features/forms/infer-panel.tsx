import type { FormSpec } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Textarea } from '@renderer/components/ui/textarea';
import { fileToBase64 } from '@renderer/features/editor/editor-tabs';
import { errorMessage } from '@renderer/lib/errors';
import { trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { Download, FileSpreadsheet, Globe, ScanSearch } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * "Suy ra đặc tả": read the forms of a real page (HTML attributes) or an
 * OpenAPI / JSON Schema document; the QC reviews the result before saving [R-02].
 */
export function InferPanel({
  projectId,
  onAdd,
}: {
  projectId: string;
  onAdd: (forms: FormSpec[]) => void;
}) {
  const tx = useTx();
  const [url, setUrl] = useState('');
  const [scanId, setScanId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [schemaText, setSchemaText] = useState('');
  const open = useRef<string | null>(null);
  open.current = scanId;
  // The scan browser closes with the screen.
  useEffect(
    () => () => {
      if (open.current) void trpcClient.recorder.stop.mutate({ recordingId: open.current });
    },
    [],
  );

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      setBusy(false);
    }
  };

  const openPage = () =>
    guard(async () => {
      if (scanId) await trpcClient.recorder.stop.mutate({ recordingId: scanId });
      const info = await trpcClient.recorder.startScan.mutate({
        projectId,
        ...(url.trim() ? { url: url.trim() } : {}),
      });
      setScanId(info.recordingId);
    });

  const readPage = () =>
    guard(async () => {
      if (!scanId) return;
      const forms = await trpcClient.recorder.scanForms.mutate({ recordingId: scanId });
      if (forms.length === 0) toast.info(tx('ui.forms.scanNone'));
      else {
        onAdd(forms as FormSpec[]);
        toast.success(tx('ui.forms.scanDone', { count: forms.length }));
      }
    });

  const closePage = () =>
    guard(async () => {
      if (scanId) await trpcClient.recorder.stop.mutate({ recordingId: scanId });
      setScanId(null);
    });

  const fileRef = useRef<HTMLInputElement>(null);
  const readExcelFile = (file: File) =>
    guard(async () => {
      const { form, warnings } = await trpcClient.forms.fromExcel.mutate({
        data: await fileToBase64(file),
        fileName: file.name,
      });
      if (form.fields.length === 0) {
        toast.info(tx('ui.forms.excelNone'));
        return;
      }
      onAdd([form as FormSpec]);
      toast.success(tx('ui.forms.scanDone', { count: 1 }));
      for (const w of warnings.slice(0, 5)) toast.warning(w);
    });

  const downloadTemplate = () =>
    guard(async () => {
      const r = await trpcClient.forms.specTemplate.query();
      const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kiemi-dac-ta-field-mau.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });

  const readSchema = () =>
    guard(async () => {
      const forms = await trpcClient.forms.fromSchema.mutate({ text: schemaText });
      if (forms.length === 0) toast.info(tx('ui.forms.schemaNone'));
      else {
        onAdd(forms as FormSpec[]);
        toast.success(tx('ui.forms.scanDone', { count: forms.length }));
      }
    });

  return (
    <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-2" data-testid="infer-panel">
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Globe className="size-4 text-muted-foreground" aria-hidden /> {tx('ui.forms.fromPage')}
        </h2>
        <p className="text-xs text-muted-foreground">{tx('ui.forms.fromPageHint')}</p>
        <div className="flex gap-2">
          <Input
            aria-label={tx('ui.forms.pageUrl')}
            value={url}
            placeholder={tx('ui.forms.pathHint')}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void openPage()}>
            {tx('ui.forms.openPage')}
          </Button>
        </div>
        {scanId && (
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void readPage()}>
              <ScanSearch /> {tx('ui.forms.readPage')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void closePage()}>
              {tx('ui.forms.closePage')}
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{tx('ui.forms.fromSchema')}</h2>
        <p className="text-xs text-muted-foreground">{tx('ui.forms.fromSchemaHint')}</p>
        <Textarea
          aria-label={tx('ui.forms.fromSchema')}
          rows={3}
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
        />
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || schemaText.trim().length < 2}
            onClick={() => void readSchema()}
          >
            {tx('ui.forms.readSchema')}
          </Button>
        </div>
        <h2 className="mt-2 flex items-center gap-2 text-sm font-semibold">
          <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
          {tx('ui.forms.fromExcel')}
        </h2>
        <p className="text-xs text-muted-foreground">{tx('ui.forms.fromExcelHint')}</p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void readExcelFile(file);
          }}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {tx('ui.forms.chooseExcel')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void downloadTemplate()}>
            <Download /> {tx('ui.forms.downloadTemplate')}
          </Button>
        </div>
      </div>
    </section>
  );
}

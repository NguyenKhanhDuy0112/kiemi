import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { ScanSearch } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type Result = Awaited<ReturnType<typeof trpcClient.recorder.scanElements.mutate>>;

/**
 * Opens a page, lists its buttons / fields / links / menus and paints each one:
 * green = some test acts on or checks it, red = no test touches it [CV-03].
 */
export function ElementsPanel() {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const scan = async () => {
    setBusy(true);
    let id: string | null = null;
    try {
      const info = await trpcClient.recorder.startScan.mutate({
        projectId,
        ...(url.trim() ? { url: url.trim() } : {}),
      });
      id = info.recordingId;
      // Let the page finish loading before reading it.
      await new Promise((r) => setTimeout(r, 2500));
      const r = await trpcClient.recorder.scanElements.mutate({ recordingId: id, projectId });
      setResult(r);
      if (!r) toast.info(tx('ui.elementCoverage.none'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      if (id) await trpcClient.recorder.stop.mutate({ recordingId: id }).catch(() => undefined);
      setBusy(false);
    }
  };

  const missing = result?.items.filter((i) => !i.covered) ?? [];
  return (
    <section className="flex flex-col gap-3" data-testid="elements-panel">
      <h2 className="text-base font-semibold">{tx('ui.elementCoverage.title')}</h2>
      <p className="text-sm text-muted-foreground">{tx('ui.elementCoverage.hint')}</p>
      <div className="flex gap-2">
        <Input
          aria-label={tx('ui.forms.pageUrl')}
          value={url}
          placeholder={tx('ui.forms.pathHint')}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button size="sm" disabled={busy} onClick={() => void scan()}>
          <ScanSearch /> {tx('ui.elementCoverage.scan')}
        </Button>
      </div>
      {result && (
        <>
          <p className="text-sm" data-testid="elements-summary">
            {tx('ui.elementCoverage.summary', {
              percent: result.coveredPercent ?? 0,
              covered: result.items.length - missing.length,
              total: result.items.length,
            })}
          </p>
          <div
            className="relative max-w-full overflow-auto rounded-md border"
            style={{ width: 'fit-content' }}
          >
            <div className="relative" style={{ width: result.width, height: result.height }}>
              <img
                src={`data:image/png;base64,${result.screenshot}`}
                width={result.width}
                height={result.height}
                alt={tx('ui.elementCoverage.title')}
              />
              {result.items.map((i) => (
                <div
                  key={`${i.rect.x}-${i.rect.y}-${i.name}-${i.id}`}
                  title={`${i.name || i.tag} — ${tx(i.covered ? 'ui.elementCoverage.covered' : 'ui.elementCoverage.uncovered')}`}
                  className={`absolute border-2 ${i.covered ? 'border-emerald-500 bg-emerald-500/15' : 'border-red-500 bg-red-500/20'}`}
                  style={{
                    left: i.rect.x,
                    top: i.rect.y,
                    width: i.rect.width,
                    height: i.rect.height,
                  }}
                />
              ))}
            </div>
          </div>
          {missing.length > 0 && (
            <ul className="list-disc pl-5 text-sm" data-testid="elements-missing">
              {missing.map((i) => (
                <li key={`${i.rect.x}-${i.rect.y}-${i.name}-${i.id}`}>
                  {tx(`ui.elementCoverage.kind.${i.kind}`)}: {i.name || i.id || i.tag}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

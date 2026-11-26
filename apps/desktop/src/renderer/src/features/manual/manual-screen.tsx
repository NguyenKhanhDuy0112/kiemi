import { type ManualCase, type ManualStatus, manualCaseStatus, mergeImported } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Textarea } from '@renderer/components/ui/textarea';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  FileSpreadsheet,
  ImagePlus,
  ListChecks,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fileToBase64 } from '../editor/editor-tabs';
import { ImportPanel } from './import-panel';
import { addAttachment, countCases, moveStep, newCase, newStep, patchStep } from './manual-edit';

const STATUSES: ManualStatus[] = ['untested', 'pass', 'fail', 'blocked'];
const TONE: Record<ManualStatus, string> = {
  untested: 'bg-muted text-muted-foreground',
  pass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  fail: 'bg-red-500/15 text-red-700 dark:text-red-400',
  blocked: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

export function StatusPill({ status }: { status: ManualStatus }) {
  const tx = useTx();
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TONE[status]}`}>
      {tx(`ui.manual.status.${status}`)}
    </span>
  );
}

/** "Case thủ công": steps + expected results a person runs by hand, marked pass/fail [T-03]. */
export function ManualScreen() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const stored = project.data?.manualCases;
  const [cases, setCases] = useState<ManualCase[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  useEffect(() => setCases(stored ?? []), [stored]);
  const dirty = JSON.stringify(cases) !== JSON.stringify(stored ?? []);
  const current = cases.find((c) => c.id === selected) ?? null;
  const counts = countCases(cases);

  const change = (c: ManualCase) => setCases((all) => all.map((x) => (x.id === c.id ? c : x)));
  const save = async () => {
    try {
      await trpcClient.projects.setManualCases.mutate({ id: projectId, cases });
      await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const add = () => {
    const c = newCase(tx('ui.manual.newName'));
    setCases((all) => [...all, c]);
    setSelected(c.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-testid="manual-screen">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ListChecks className="size-5 text-muted-foreground" aria-hidden />
          {tx('ui.manual.title')}
        </h1>
        <span className="text-sm text-muted-foreground">
          {tx('ui.manual.summary', counts as unknown as Record<string, number>)}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImporting((v) => !v)}>
            <FileSpreadsheet /> {tx('ui.manual.import.open')}
          </Button>
          <Button variant="outline" size="sm" onClick={add}>
            <Plus /> {tx('ui.manual.add')}
          </Button>
          <Button size="sm" disabled={!dirty} onClick={() => void save()}>
            {tx('ui.actions.save')}
          </Button>
        </div>
      </header>
      {importing && (
        <ImportPanel
          onImport={(imported) => {
            const m = mergeImported(cases, imported);
            setCases(m.cases);
            setImporting(false);
            toast.success(tx('ui.manual.import.done', { added: m.added, updated: m.updated }));
          }}
        />
      )}
      <div className="flex min-h-0 flex-1 gap-4">
        <ul
          className="w-72 shrink-0 overflow-auto rounded-md border"
          aria-label={tx('ui.manual.title')}
        >
          {cases.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">{tx('ui.manual.empty')}</li>
          )}
          {cases.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelected(c.id)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${c.id === selected ? 'bg-accent' : ''}`}
              >
                <span className="truncate">{c.name}</span>
                <StatusPill status={manualCaseStatus(c)} />
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 flex-1 overflow-auto">
          {current ? (
            <CaseEditor
              key={current.id}
              value={current}
              saved={(stored ?? []).some((c) => c.id === current.id) && !dirty}
              onChange={change}
              onRemove={() => {
                setCases((all) => all.filter((x) => x.id !== current.id));
                setSelected(null);
              }}
              onLinked={(testId) => change({ ...current, automatedTestId: testId })}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{tx('ui.manual.pick')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CaseEditor({
  value: c,
  saved,
  onChange,
  onRemove,
  onLinked,
}: {
  value: ManualCase;
  saved: boolean;
  onChange: (c: ManualCase) => void;
  onRemove: () => void;
  onLinked: (testId: string) => void;
}) {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const openTest = useAppStore((s) => s.openTest);
  const setView = useAppStore((s) => s.setView);

  const toAutomatic = async () => {
    try {
      const t = await trpcClient.testCases.create.mutate({ projectId, name: c.name });
      onLinked(t.id);
      toast.success(tx('ui.manual.automaticCreated'));
      openTest(t.id);
      setView('tests');
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const attach = async (stepId: string, file: File | undefined) => {
    if (!file) return;
    const data = await fileToBase64(file);
    const next = addAttachment(c, stepId, {
      name: file.name,
      dataUrl: `data:${file.type || 'image/png'};base64,${data}`,
    });
    if (next) onChange(next);
    else toast.error(tx('ui.manual.badPicture'));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={c.name}
          aria-label={tx('ui.manual.name')}
          onChange={(e) => onChange({ ...c, name: e.target.value })}
        />
        <Input
          className="w-48"
          value={c.group}
          placeholder={tx('ui.manual.group')}
          aria-label={tx('ui.manual.group')}
          onChange={(e) => onChange({ ...c, group: e.target.value })}
        />
      </div>
      <Textarea
        rows={2}
        value={c.preconditions}
        placeholder={tx('ui.manual.preconditions')}
        aria-label={tx('ui.manual.preconditions')}
        onChange={(e) => onChange({ ...c, preconditions: e.target.value })}
      />
      <ol className="flex flex-col gap-2">
        {c.steps.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <span className="w-6 text-sm text-muted-foreground">{i + 1}</span>
              <fieldset className="flex gap-1 border-0 p-0" aria-label={tx('ui.manual.result')}>
                {STATUSES.map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={s.status === st ? 'default' : 'outline'}
                    aria-pressed={s.status === st}
                    onClick={() => onChange(patchStep(c, s.id, { status: st }))}
                  >
                    {tx(`ui.manual.status.${st}`)}
                  </Button>
                ))}
              </fieldset>
              <div className="ml-auto flex">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={tx('ui.manual.up')}
                  onClick={() => onChange(moveStep(c, s.id, -1))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={tx('ui.manual.down')}
                  onClick={() => onChange(moveStep(c, s.id, 1))}
                >
                  <ArrowDown />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={tx('ui.manual.removeStep')}
                  onClick={() => onChange({ ...c, steps: c.steps.filter((x) => x.id !== s.id) })}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Textarea
                rows={2}
                value={s.action}
                placeholder={tx('ui.manual.action')}
                aria-label={tx('ui.manual.action')}
                onChange={(e) => onChange(patchStep(c, s.id, { action: e.target.value }))}
              />
              <Textarea
                rows={2}
                value={s.expected}
                placeholder={tx('ui.manual.expected')}
                aria-label={tx('ui.manual.expected')}
                onChange={(e) => onChange(patchStep(c, s.id, { expected: e.target.value }))}
              />
            </div>
            {s.status === 'fail' && (
              <Textarea
                rows={2}
                value={s.actual}
                placeholder={tx('ui.manual.actual')}
                aria-label={tx('ui.manual.actual')}
                onChange={(e) => onChange(patchStep(c, s.id, { actual: e.target.value }))}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {s.attachments.map((a, ai) => (
                <span key={a.dataUrl.slice(-40) + a.name} className="relative">
                  <img src={a.dataUrl} alt={a.name} className="h-16 rounded border" />
                  <button
                    type="button"
                    aria-label={tx('ui.manual.removePicture')}
                    className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow"
                    onClick={() =>
                      onChange(
                        patchStep(c, s.id, {
                          attachments: s.attachments.filter((_, k) => k !== ai),
                        }),
                      )
                    }
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <Button size="sm" variant="ghost" asChild>
                <label className="cursor-pointer">
                  <ImagePlus /> {tx('ui.manual.addPicture')}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      void attach(s.id, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...c, steps: [...c.steps, newStep()] })}
        >
          <Plus /> {tx('ui.manual.addStep')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...c, steps: c.steps.map((x) => ({ ...x, status: 'pass' })) })}
        >
          {tx('ui.manual.allPass')}
        </Button>
        {c.automatedTestId ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              openTest(c.automatedTestId ?? null);
              setView('tests');
            }}
          >
            <Bot /> {tx('ui.manual.openAutomatic')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!saved}
            title={saved ? undefined : tx('ui.manual.saveFirst')}
            onClick={() => void toAutomatic()}
          >
            <Bot /> {tx('ui.manual.toAutomatic')}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={onRemove}>
          <Trash2 /> {tx('ui.manual.remove')}
        </Button>
      </div>
    </div>
  );
}

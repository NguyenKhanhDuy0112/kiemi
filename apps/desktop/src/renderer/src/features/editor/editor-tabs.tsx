import type { DatasetSource, Step, TestCase } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Checkbox } from '@renderer/components/ui/checkbox';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Plus, Trash2, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { CombinationsDialog } from './combinations-dialog';
import { DatasetTree } from './dataset-tree-view';
import { childLists, type EnvMode, nextEnvLimit, sessionUsage } from './doc-model';
import { useEditorStore } from './editor-store';
import { EffectiveVariables } from './effective-variables';
import { EnvironmentRows } from './environment-rows';

const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SESSION_NAME = /^[A-Za-z0-9_-]+$/;

function setDoc(change: (doc: TestCase) => TestCase) {
  useEditorStore.getState().apply(change);
}

/** Reads a file picked in the renderer as base64 (the renderer has no file system). */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Tab "Dữ liệu": no data, a saved dataset, or a manual table (E-03). */
export function DataTab() {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId);
  const doc = useEditorStore((s) => s.doc);
  const qc = useQueryClient();
  const datasets = useQuery({
    ...trpc.datasets.list.queryOptions({ projectId: projectId ?? '' }),
    enabled: !!projectId,
  });
  const importFile = useMutation(trpc.datasets.importFile.mutationOptions());
  const fileRef = useRef<HTMLInputElement>(null);
  const [linked, setLinked] = useState(false);
  const [combos, setCombos] = useState(false);
  if (!doc) return null;
  const source = doc.dataset;
  const mode = source?.source === 'table' ? 'table' : source?.source === 'saved' ? 'saved' : 'none';
  const set = (dataset: DatasetSource | undefined) =>
    setDoc((d) => {
      const { dataset: _old, ...rest } = d;
      return dataset ? { ...rest, dataset } : (rest as TestCase);
    });

  const onFile = async (file: File) => {
    if (!projectId) return;
    try {
      const ds = await importFile.mutateAsync({
        projectId,
        name: file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        data: await fileToBase64(file),
        ...(linked && /\.xlsx$/i.test(file.name) ? { linked: true } : {}),
      });
      await qc.invalidateQueries({ queryKey: trpc.datasets.list.queryKey({ projectId }) });
      set({ source: 'saved', datasetId: ds.id });
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  const table =
    source?.source === 'table'
      ? source
      : { source: 'table' as const, columns: [] as string[], rows: [] as Record<string, string>[] };
  const setTable = (columns: string[], rows: Record<string, string>[]) =>
    set({ source: 'table', columns, rows });

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-sm text-muted-foreground">
        {tx('ui.data.hint', { example: '{{row.tenCot}}' })}
      </p>
      <Select
        value={mode}
        onValueChange={(m) => {
          if (m === 'none') set(undefined);
          else if (m === 'table') setTable(['cot1'], [{ cot1: '' }]);
          else if (datasets.data?.[0]) set({ source: 'saved', datasetId: datasets.data[0].id });
          else fileRef.current?.click();
        }}
      >
        <SelectTrigger className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{tx('ui.data.none')}</SelectItem>
          <SelectItem value="saved">{tx('ui.data.saved')}</SelectItem>
          <SelectItem value="table">{tx('ui.data.table')}</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" className="self-start" onClick={() => setCombos(true)}>
        <Wand2 /> {tx('ui.data.combosOpen')}
      </Button>
      <CombinationsDialog
        open={combos}
        onClose={() => setCombos(false)}
        onUse={(columns, rows) => setTable(columns, rows)}
      />

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv,.txt"
        hidden
        onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
      />

      {mode === 'saved' && source?.source === 'saved' && (
        <div className="flex items-center gap-2">
          <Select
            value={source.datasetId}
            onValueChange={(datasetId) => set({ source: 'saved', datasetId })}
          >
            <SelectTrigger className="w-72" aria-label={tx('ui.data.pickSaved')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(datasets.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} · {tx('ui.data.rows', { count: d.rows.length })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp /> {tx('ui.data.importFile')}
          </Button>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="data-linked"
              checked={linked}
              onCheckedChange={(v) => setLinked(v === true)}
            />
            <Label htmlFor="data-linked">{tx('ui.data.tree.importLinked')}</Label>
          </div>
        </div>
      )}
      {mode === 'saved' && source?.source === 'saved' && (
        <DatasetTree key={`tree-${source.datasetId}`} datasetId={source.datasetId} />
      )}
      {mode === 'saved' && source?.source === 'saved' && (
        <EnvironmentRows key={source.datasetId} datasetId={source.datasetId} />
      )}

      {mode === 'table' && (
        <div className="overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                {table.columns.map((c, ci) => (
                  <th key={c} className="p-1">
                    <Input
                      aria-label={tx('ui.data.columnName')}
                      defaultValue={c}
                      className="h-8 font-medium"
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (!name || name === c || table.columns.includes(name)) return;
                        setTable(
                          table.columns.map((x, i) => (i === ci ? name : x)),
                          table.rows.map((r) => {
                            const { [c]: v, ...rest } = r;
                            return { ...rest, [name]: v ?? '' };
                          }),
                        );
                      }}
                    />
                  </th>
                ))}
                <th className="w-10 p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={tx('ui.data.addColumn')}
                    onClick={() => {
                      let n = table.columns.length + 1;
                      while (table.columns.includes(`cot${n}`)) n++;
                      setTable([...table.columns, `cot${n}`], table.rows);
                    }}
                  >
                    <Plus />
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional.
                <tr key={ri} className="border-t">
                  {table.columns.map((c) => (
                    <td key={c} className="p-1">
                      <Input
                        className="h-8"
                        value={r[c] ?? ''}
                        onChange={(e) =>
                          setTable(
                            table.columns,
                            table.rows.map((x, i) =>
                              i === ri ? { ...x, [c]: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td className="p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={tx('ui.props.list.remove')}
                      onClick={() =>
                        setTable(
                          table.columns,
                          table.rows.filter((_, i) => i !== ri),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t p-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setTable(table.columns, [
                  ...table.rows,
                  Object.fromEntries(table.columns.map((c) => [c, ''])),
                ])
              }
            >
              <Plus /> {tx('ui.data.addRow')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tab "Biến": test-level variables (E-02). */
export function VariablesTab() {
  const tx = useTx();
  const doc = useEditorStore((s) => s.doc);
  const [draft, setDraft] = useState('');
  if (!doc) return null;
  const entries = Object.entries(doc.variables);
  const setVars = (variables: Record<string, string>) => setDoc((d) => ({ ...d, variables }));
  const bad = draft !== '' && !VAR_NAME.test(draft);
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        {tx('ui.variables.hint', { example: '{{tenBien}}' })}
      </p>
      {entries.map(([name, value]) => (
        <div key={name} className="flex items-center gap-2">
          <code className="w-48 truncate rounded bg-muted px-2 py-1.5 text-xs">{`{{${name}}}`}</code>
          <Input
            aria-label={tx('ui.variables.value')}
            value={value}
            onChange={(e) => setVars({ ...doc.variables, [name]: e.target.value })}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={tx('ui.actions.delete')}
            onClick={() => {
              const { [name]: _gone, ...rest } = doc.variables;
              setVars(rest);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <form
        className="flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft || bad || draft in doc.variables) return;
          setVars({ ...doc.variables, [draft]: '' });
          setDraft('');
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-var" className="sr-only">
            {tx('ui.variables.name')}
          </Label>
          <Input
            id="new-var"
            className="w-48"
            placeholder={tx('ui.variables.name')}
            value={draft}
            aria-invalid={bad || undefined}
            onChange={(e) => setDraft(e.target.value)}
          />
          {bad && <p className="text-xs text-destructive">{tx('ui.variables.invalidName')}</p>}
        </div>
        <Button type="submit" variant="outline" disabled={!draft || bad}>
          <Plus /> {tx('ui.variables.add')}
        </Button>
      </form>
      <EffectiveVariables testCaseId={doc.id} />
    </div>
  );
}

function renameSession(steps: Step[], from: string, to: string): Step[] {
  return steps.map((s) => {
    const params = { ...s.params };
    for (const c of childLists(s)) params[c.key] = renameSession(c.steps, from, to);
    return { ...s, session: s.session === from ? to : s.session, params };
  });
}

/** Tab "Phiên": browser sessions = separate users (F-01). */
export function SessionsTab() {
  const tx = useTx();
  const doc = useEditorStore((s) => s.doc);
  const [draft, setDraft] = useState('');
  if (!doc) return null;
  const usage = sessionUsage(doc);
  const bad = draft !== '' && !SESSION_NAME.test(draft);
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">{tx('ui.sessions.hint')}</p>
      {doc.sessions.map((name) => {
        const used = usage.get(name) ?? 0;
        return (
          <div key={name} className="flex items-center gap-2">
            <Input
              className="w-48"
              defaultValue={name}
              aria-label={tx('ui.props.session')}
              onBlur={(e) => {
                const to = e.target.value.trim();
                if (!to || to === name || !SESSION_NAME.test(to) || doc.sessions.includes(to)) {
                  e.target.value = name;
                  return;
                }
                setDoc((d) => ({
                  ...d,
                  sessions: d.sessions.map((s) => (s === name ? to : s)),
                  steps: renameSession(d.steps, name, to),
                  cleanup: renameSession(d.cleanup, name, to),
                }));
              }}
            />
            <span className="text-xs text-muted-foreground">
              {tx('ui.sessions.inUse', { count: used })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={tx('ui.actions.delete')}
              disabled={used > 0 || doc.sessions.length === 1}
              title={used > 0 ? tx('ui.sessions.cannotRemove') : undefined}
              onClick={() =>
                setDoc((d) => ({ ...d, sessions: d.sessions.filter((s) => s !== name) }))
              }
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
      <form
        className="flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft || bad || doc.sessions.includes(draft)) return;
          setDoc((d) => ({ ...d, sessions: [...d.sessions, draft] }));
          setDraft('');
        }}
      >
        <div className="flex flex-col gap-1">
          <Input
            className="w-48"
            placeholder={tx('ui.examples.session')}
            aria-label={tx('ui.sessions.add')}
            value={draft}
            aria-invalid={bad || undefined}
            onChange={(e) => setDraft(e.target.value)}
          />
          {bad && <p className="text-xs text-destructive">{tx('ui.sessions.invalidName')}</p>}
        </div>
        <Button type="submit" variant="outline" disabled={!draft || bad}>
          <Plus /> {tx('ui.sessions.add')}
        </Button>
      </form>
      <SavedLogins />
    </div>
  );
}

/** Saved login sessions of the project, with expiry [F-02]. */
function SavedLogins() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId);
  const list = useQuery({
    ...trpc.savedLogins.list.queryOptions({ projectId: projectId ?? '' }),
    enabled: !!projectId,
  });
  const remove = useMutation(trpc.savedLogins.remove.mutationOptions());
  const now = Date.now();
  return (
    <section className="mt-4 flex flex-col gap-2 border-t pt-4">
      <h2 className="text-sm font-semibold">{tx('ui.logins.title')}</h2>
      <p className="text-sm text-muted-foreground">{tx('ui.logins.text')}</p>
      {!list.data?.length ? (
        <p className="text-sm text-muted-foreground">{tx('ui.logins.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.data.map((l) => {
            const expired = new Date(l.expiresAt).getTime() <= now;
            return (
              <li key={l.id} className="flex items-center gap-2 text-sm">
                <span className="w-48 truncate font-medium">{l.name}</span>
                <span className={expired ? 'text-fail-text' : 'text-muted-foreground'}>
                  {expired
                    ? tx('ui.logins.expired')
                    : tx('ui.logins.expires', { when: new Date(l.expiresAt).toLocaleString() })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${tx('ui.logins.remove')} ${l.name}`}
                  onClick={async () => {
                    try {
                      await remove.mutateAsync({ id: l.id });
                      if (projectId)
                        await qc.invalidateQueries({
                          queryKey: trpc.savedLogins.list.queryKey({ projectId }),
                        });
                    } catch (err) {
                      toast.error(errorMessage(err, tx));
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Tab "Môi trường": which environments the test may run on [O-06]. */
export function EnvironmentsTab() {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId);
  const doc = useEditorStore((s) => s.doc);
  const envs = useQuery({
    ...trpc.environments.list.queryOptions({ projectId: projectId ?? '' }),
    enabled: !!projectId,
  });
  if (!doc) return null;
  const limit = doc.environments;
  const mode: EnvMode = limit?.only ? 'only' : limit?.except ? 'except' : 'all';
  const names = limit?.only ?? limit?.except ?? [];
  const apply = (change: Parameters<typeof nextEnvLimit>[1]) =>
    setDoc((d) => {
      const { environments: _old, ...rest } = d;
      const next = nextEnvLimit(d.environments, change);
      return next ? { ...rest, environments: next } : (rest as TestCase);
    });
  const known = new Set((envs.data ?? []).map((e) => e.name));
  const options = [...(envs.data ?? []).map((e) => e.name), ...names.filter((n) => !known.has(n))];
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">{tx('ui.envLimit.hint')}</p>
      <Select value={mode} onValueChange={(m) => apply({ mode: m as EnvMode })}>
        <SelectTrigger className="w-72" aria-label={tx('ui.envLimit.mode')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tx('ui.envLimit.all')}</SelectItem>
          <SelectItem value="only">{tx('ui.envLimit.only')}</SelectItem>
          <SelectItem value="except">{tx('ui.envLimit.except')}</SelectItem>
        </SelectContent>
      </Select>
      {mode !== 'all' && (
        <ul className="flex flex-col gap-1.5">
          {options.map((name) => (
            <li key={name} className="flex items-center gap-2">
              <Checkbox
                id={`env-limit-${name}`}
                checked={names.includes(name)}
                onCheckedChange={() => apply({ toggle: name })}
              />
              <Label htmlFor={`env-limit-${name}`} className="font-normal">
                {name}
              </Label>
            </li>
          ))}
        </ul>
      )}
      {mode !== 'all' && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="env-limit-reason">{tx('ui.envLimit.reason')}</Label>
          <Input
            id="env-limit-reason"
            className="max-w-md"
            placeholder={tx('ui.envLimit.reasonPlaceholder')}
            value={limit?.reason ?? ''}
            onChange={(e) => apply({ reason: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

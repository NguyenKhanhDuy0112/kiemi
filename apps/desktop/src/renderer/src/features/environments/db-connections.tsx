import { DB_KINDS, type DbConnection } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { errorMessage } from '@renderer/lib/errors';
import { trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { Database, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { connectionProblem, tidyConnection } from './db-connections-edit';

const NONE = '';
const DEFAULT_PORT: Record<DbConnection['kind'], number | undefined> = {
  postgres: 5432,
  mysql: 3306,
  mssql: 1433,
  sqlite: undefined,
};

const blank = (): DbConnection => ({
  name: '',
  kind: 'postgres',
  host: '',
  port: 5432,
  database: '',
  username: '',
  ssl: false,
});

/** Databases a test can read on this environment: kind, address, user and password secret [X-05]. */
export function DbConnectionsForm({
  environmentId,
  value,
  secretNames,
  onSave,
}: {
  environmentId: string;
  value: DbConnection[] | undefined;
  secretNames: string[];
  onSave: (next: DbConnection[]) => void;
}) {
  const tx = useTx();
  const list = value ?? [];
  const [draft, setDraft] = useState<DbConnection | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const taken = list.map((c) => c.name).filter((n) => n !== editing);
  const problem = draft ? connectionProblem(draft, taken) : null;

  const test = async (c: DbConnection) => {
    setBusy(true);
    try {
      const r = await trpcClient.dbQuery.test.mutate({
        environmentId,
        connection: tidyConnection(c),
      });
      if (r.ok) toast.success(tx('ui.environments.db.testOk'));
      else toast.error(tx('ui.environments.db.testFailed', { reason: r.message }));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      setBusy(false);
    }
  };
  const patch = (p: Partial<DbConnection>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3" data-testid="db-connections">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Database className="size-4 text-muted-foreground" aria-hidden />
          {tx('ui.environments.db.title')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{tx('ui.environments.db.hint')}</p>
      </div>
      <ul className="flex flex-col gap-1">
        {list.map((c) => (
          <li key={c.name} className="flex items-center gap-2 text-sm">
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-muted-foreground">
              {tx(`ui.environments.db.kind.${c.kind}`)} ·{' '}
              {c.kind === 'sqlite' ? c.database : `${c.host}/${c.database}`}
            </span>
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void test(c)}>
                {tx('ui.environments.db.test')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(c.name);
                  setDraft({ ...c });
                }}
              >
                {tx('ui.actions.rename')}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={tx('ui.actions.delete')}
                onClick={() => onSave(list.filter((x) => x.name !== c.name))}
              >
                <Trash2 />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {draft ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={draft.name}
            placeholder={tx('ui.environments.db.name')}
            aria-label={tx('ui.environments.db.name')}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label={tx('ui.environments.db.kindLabel')}
            value={draft.kind}
            onChange={(e) => {
              const kind = e.target.value as DbConnection['kind'];
              patch({ kind, port: DEFAULT_PORT[kind] });
            }}
          >
            {DB_KINDS.map((k) => (
              <option key={k} value={k}>
                {tx(`ui.environments.db.kind.${k}`)}
              </option>
            ))}
          </select>
          {draft.kind !== 'sqlite' && (
            <>
              <Input
                value={draft.host ?? ''}
                placeholder={tx('ui.environments.db.host')}
                aria-label={tx('ui.environments.db.host')}
                onChange={(e) => patch({ host: e.target.value })}
              />
              <Input
                type="number"
                value={draft.port ?? ''}
                placeholder={tx('ui.environments.db.port')}
                aria-label={tx('ui.environments.db.port')}
                onChange={(e) => patch({ port: Number(e.target.value) || undefined })}
              />
            </>
          )}
          <Input
            className={draft.kind === 'sqlite' ? 'sm:col-span-2' : ''}
            value={draft.database}
            placeholder={tx(
              draft.kind === 'sqlite' ? 'ui.environments.db.file' : 'ui.environments.db.database',
            )}
            aria-label={tx(
              draft.kind === 'sqlite' ? 'ui.environments.db.file' : 'ui.environments.db.database',
            )}
            onChange={(e) => patch({ database: e.target.value })}
          />
          {draft.kind !== 'sqlite' && (
            <>
              <Input
                value={draft.username ?? ''}
                placeholder={tx('ui.environments.db.username')}
                aria-label={tx('ui.environments.db.username')}
                onChange={(e) => patch({ username: e.target.value })}
              />
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                aria-label={tx('ui.environments.db.password')}
                value={draft.passwordSecret ?? NONE}
                onChange={(e) => patch({ passwordSecret: e.target.value || undefined })}
              >
                <option value={NONE}>{tx('ui.environments.noSecret')}</option>
                {secretNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-sm">
                <input
                  id="db-ssl"
                  type="checkbox"
                  checked={draft.ssl}
                  onChange={(e) => patch({ ssl: e.target.checked })}
                />
                <label htmlFor="db-ssl">{tx('ui.environments.db.ssl')}</label>
              </div>
            </>
          )}
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button
              size="sm"
              disabled={problem !== null}
              onClick={() => {
                const next = tidyConnection(draft);
                onSave(
                  editing ? list.map((c) => (c.name === editing ? next : c)) : [...list, next],
                );
                setDraft(null);
                setEditing(null);
              }}
            >
              {tx('ui.actions.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || problem !== null}
              onClick={() => void test(draft)}
            >
              {tx('ui.environments.db.test')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setEditing(null);
              }}
            >
              {tx('ui.actions.cancel')}
            </Button>
            {problem && (
              <span className="text-xs text-muted-foreground">
                {tx(`ui.environments.db.problem.${problem}`)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div>
          <Button size="sm" variant="outline" onClick={() => setDraft(blank())}>
            <Plus /> {tx('ui.environments.db.add')}
          </Button>
        </div>
      )}
    </div>
  );
}

import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { draftProblem, fieldsOf, NOTIFY_KINDS, type NotifyDraft, newDraft } from './notify-form';

/** Settings block "Thông báo kết quả": webhooks and email per project [X-03]. */
export function NotifySection() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const list = useQuery({ ...trpc.notify.list.queryOptions({ projectId }), enabled: !!projectId });
  const [draft, setDraft] = useState<NotifyDraft | null>(null);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: trpc.notify.list.queryKey({ projectId }) });

  const save = async () => {
    if (!draft || draftProblem(draft)) return;
    try {
      await trpcClient.notify.save.mutate({
        projectId,
        ...(draft.id ? { id: draft.id } : {}),
        channel: {
          name: draft.name.trim(),
          kind: draft.kind,
          enabled: draft.enabled,
          when: draft.when,
          config: draft.config,
        },
        ...(draft.secret ? { secret: draft.secret } : {}),
      });
      setDraft(null);
      await refresh();
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const sendTest = async (id: string) => {
    try {
      const r = await trpcClient.notify.test.mutate({ id });
      await refresh();
      if (r.ok) toast.success(tx('ui.notify.testOk'));
      else toast.error(tx('ui.notify.testFailed', { reason: r.message }));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const patchConfig = (p: Partial<NotifyDraft['config']>) =>
    setDraft((d) => (d ? { ...d, config: { ...d.config, ...p } } : d));
  const problem = draft ? draftProblem(draft) : null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" data-testid="notify-section">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Bell className="size-4 text-muted-foreground" aria-hidden />
        {tx('ui.notify.title')}
      </h2>
      <p className="text-xs text-muted-foreground">{tx('ui.notify.hint')}</p>

      <ul className="flex flex-col gap-2">
        {(list.data ?? []).map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
          >
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-muted-foreground">
              {tx(`ui.notify.kind.${c.kind}`)} · {tx(`ui.notify.when.${c.when}`)}
              {!c.enabled && ` · ${tx('ui.notify.off')}`}
            </span>
            {c.lastAt && (
              <span className={`text-xs ${c.lastOk ? 'text-emerald-600' : 'text-red-600'}`}>
                {c.lastOk
                  ? tx('ui.notify.lastOk')
                  : tx('ui.notify.lastFailed', { reason: c.lastMessage ?? '' })}
              </span>
            )}
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" onClick={() => void sendTest(c.id)}>
                <Send /> {tx('ui.notify.test')}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={tx('ui.actions.rename')}
                onClick={() =>
                  setDraft({
                    id: c.id,
                    name: c.name,
                    kind: c.kind,
                    enabled: c.enabled,
                    when: c.when,
                    config: c.config,
                    secret: '',
                    hasSecret: c.hasSecret,
                  })
                }
              >
                <Pencil />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={tx('ui.actions.delete')}
                onClick={() => void trpcClient.notify.remove.mutate({ id: c.id }).then(refresh)}
              >
                <Trash2 />
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {draft ? (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              value={draft.name}
              placeholder={tx('ui.notify.name')}
              aria-label={tx('ui.notify.name')}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label={tx('ui.notify.kindLabel')}
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as NotifyDraft['kind'] })}
            >
              {NOTIFY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {tx(`ui.notify.kind.${k}`)}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label={tx('ui.notify.whenLabel')}
              value={draft.when}
              onChange={(e) => setDraft({ ...draft, when: e.target.value as 'always' | 'failed' })}
            >
              <option value="failed">{tx('ui.notify.when.failed')}</option>
              <option value="always">{tx('ui.notify.when.always')}</option>
            </select>
          </div>
          <Input
            type="password"
            autoComplete="off"
            value={draft.secret}
            placeholder={
              draft.hasSecret ? tx('ui.notify.secretKeep') : tx(`ui.notify.secret.${draft.kind}`)
            }
            aria-label={tx(`ui.notify.secret.${draft.kind}`)}
            onChange={(e) => setDraft({ ...draft, secret: e.target.value })}
          />
          {fieldsOf(draft.kind).includes('chatId') && (
            <Input
              value={draft.config.chatId}
              placeholder={tx('ui.notify.chatId')}
              aria-label={tx('ui.notify.chatId')}
              onChange={(e) => patchConfig({ chatId: e.target.value })}
            />
          )}
          {fieldsOf(draft.kind).includes('smtp') && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={draft.config.host}
                placeholder={tx('ui.notify.host')}
                aria-label={tx('ui.notify.host')}
                onChange={(e) => patchConfig({ host: e.target.value })}
              />
              <Input
                type="number"
                value={draft.config.port}
                placeholder={tx('ui.notify.port')}
                aria-label={tx('ui.notify.port')}
                onChange={(e) => patchConfig({ port: Number(e.target.value) || 587 })}
              />
              <Input
                value={draft.config.username}
                placeholder={tx('ui.notify.username')}
                aria-label={tx('ui.notify.username')}
                onChange={(e) => patchConfig({ username: e.target.value })}
              />
              <Input
                value={draft.config.from}
                placeholder={tx('ui.notify.from')}
                aria-label={tx('ui.notify.from')}
                onChange={(e) => patchConfig({ from: e.target.value })}
              />
              <Input
                className="sm:col-span-2"
                value={draft.config.to}
                placeholder={tx('ui.notify.to')}
                aria-label={tx('ui.notify.to')}
                onChange={(e) => patchConfig({ to: e.target.value })}
              />
              <div className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  id="notify-secure"
                  type="checkbox"
                  checked={draft.config.secure}
                  onChange={(e) => patchConfig({ secure: e.target.checked })}
                />
                <label htmlFor="notify-secure">{tx('ui.notify.secure')}</label>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={problem !== null} onClick={() => void save()}>
              {tx('ui.actions.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {tx('ui.actions.cancel')}
            </Button>
            {problem && (
              <span className="text-xs text-muted-foreground">
                {tx(`ui.notify.problem.${problem}`)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={!projectId}
            onClick={() => setDraft(newDraft())}
          >
            <Plus /> {tx('ui.notify.add')}
          </Button>
        </div>
      )}
    </section>
  );
}

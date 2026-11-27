import {
  AI_PROVIDER_KINDS,
  AI_TASKS,
  type AiSettingsInput,
  DEFAULT_AI_MODELS,
} from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plug, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const EMPTY: AiSettingsInput = {
  enabled: false,
  kind: 'claude',
  model: DEFAULT_AI_MODELS.claude,
  taskModels: {},
  baseUrl: '',
  localOnly: false,
  limitTokens: null,
  priceIn: null,
  priceOut: null,
};

/** Settings block "Trợ lý AI": provider, model, key per project [AI-01]. */
export function AiSection() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const q = useQuery({ ...trpc.ai.get.queryOptions({ projectId }), enabled: !!projectId });
  const [s, setS] = useState<AiSettingsInput>(EMPTY);
  const [key, setKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const info = q.data;

  useEffect(() => {
    if (q.isSuccess) {
      setS(
        info
          ? {
              enabled: info.enabled,
              kind: info.kind,
              model: info.model,
              taskModels: info.taskModels,
              baseUrl: info.baseUrl,
              localOnly: info.localOnly,
              limitTokens: info.limitTokens,
              priceIn: info.priceIn,
              priceOut: info.priceOut,
            }
          : EMPTY,
      );
      setKey('');
      setRemoveKey(false);
    }
  }, [q.isSuccess, info]);

  const refresh = () => qc.invalidateQueries({ queryKey: trpc.ai.get.queryKey({ projectId }) });
  const save = async () => {
    try {
      await trpcClient.ai.save.mutate({
        projectId,
        settings: s,
        ...(removeKey ? { apiKey: '' } : key ? { apiKey: key } : {}),
      });
      await refresh();
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const test = async () => {
    try {
      const r = await trpcClient.ai.test.mutate({ projectId });
      await refresh();
      if (r.ok) toast.success(tx('ui.ai.testOk', { model: r.message }));
      else toast.error(tx('ui.ai.testFailed', { reason: r.message }));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const patch = (p: Partial<AiSettingsInput>) => setS((d) => ({ ...d, ...p }));
  const setTaskModel = (task: (typeof AI_TASKS)[number], v: string) =>
    setS((d) => {
      const m = { ...d.taskModels };
      if (v.trim()) m[task] = v;
      else delete m[task];
      return { ...d, taskModels: m };
    });
  const needsKey = s.kind !== 'ollama';

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" data-testid="ai-section">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
        {tx('ui.ai.title')}
      </h2>
      <p className="text-xs text-muted-foreground">{tx('ui.ai.hint')}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.enabled}
          disabled={!projectId}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        {tx('ui.ai.enabled')}
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label={tx('ui.ai.provider')}
          value={s.kind}
          onChange={(e) => {
            const kind = e.target.value as AiSettingsInput['kind'];
            patch({ kind, model: DEFAULT_AI_MODELS[kind] });
          }}
        >
          {AI_PROVIDER_KINDS.map((k) => (
            <option key={k} value={k}>
              {tx(`ui.ai.kind.${k}`)}
            </option>
          ))}
        </select>
        <Input
          value={s.model}
          placeholder={tx('ui.ai.model')}
          aria-label={tx('ui.ai.model')}
          onChange={(e) => patch({ model: e.target.value })}
        />
        <Input
          value={s.baseUrl}
          placeholder={tx('ui.ai.baseUrl')}
          aria-label={tx('ui.ai.baseUrl')}
          onChange={(e) => patch({ baseUrl: e.target.value })}
        />
        {needsKey && (
          <Input
            type="password"
            autoComplete="off"
            value={key}
            disabled={removeKey}
            placeholder={info?.hasKey ? tx('ui.ai.keyKeep') : tx('ui.ai.apiKey')}
            aria-label={tx('ui.ai.apiKey')}
            onChange={(e) => setKey(e.target.value)}
          />
        )}
      </div>
      {needsKey && info?.hasKey && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={removeKey}
            onChange={(e) => setRemoveKey(e.target.checked)}
          />
          {tx('ui.ai.keyRemove')}
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.localOnly}
          onChange={(e) => patch({ localOnly: e.target.checked })}
        />
        {tx('ui.ai.localOnly')}
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        {(['limitTokens', 'priceIn', 'priceOut'] as const).map((f) => (
          <Input
            key={f}
            type="number"
            min={0}
            value={s[f] ?? ''}
            placeholder={tx(`ui.ai.${f}`)}
            aria-label={tx(`ui.ai.${f}`)}
            onChange={(e) => patch({ [f]: e.target.value === '' ? null : Number(e.target.value) })}
          />
        ))}
      </div>
      {info?.usage && (
        <p className="text-xs text-muted-foreground">
          {tx('ui.ai.usage', {
            month: info.usage.month,
            tokens: info.usage.tokens,
            calls: info.usage.calls,
          })}
          {info.priceIn !== null && tx('ui.ai.usageCost', { cost: info.usage.cost.toFixed(2) })}
        </p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {tx('ui.ai.taskModels')}
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {AI_TASKS.map((t) => (
            <Input
              key={t}
              value={s.taskModels[t] ?? ''}
              placeholder={tx(`ui.ai.task.${t}`)}
              aria-label={tx(`ui.ai.task.${t}`)}
              onChange={(e) => setTaskModel(t, e.target.value)}
            />
          ))}
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!projectId || !s.model.trim()} onClick={() => void save()}>
          {tx('ui.actions.save')}
        </Button>
        <Button size="sm" variant="outline" disabled={!info} onClick={() => void test()}>
          <Plug /> {tx('ui.ai.test')}
        </Button>
        {info?.lastAt && (
          <span className={`text-xs ${info.lastOk ? 'text-emerald-600' : 'text-red-600'}`}>
            {info.lastOk
              ? tx('ui.ai.lastOk')
              : tx('ui.ai.lastFailed', { reason: info.lastMessage ?? '' })}
          </span>
        )}
      </div>
    </section>
  );
}

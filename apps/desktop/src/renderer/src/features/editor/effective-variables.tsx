import { Badge } from '@renderer/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useAppStore } from '@renderer/lib/store';
import { trpc } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { useState } from 'react';
import { useRunStore } from '../run/run-store';

const NONE = '__none__';

/** "Giá trị hiệu lực" [O-04]: each variable, its value and the level it comes from. */
export function EffectiveVariables({ testCaseId }: { testCaseId: string }) {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const preferred = useRunStore((s) => s.prefs.environmentId);
  const envs = useQuery({
    ...trpc.environments.list.queryOptions({ projectId }),
    enabled: !!projectId,
  });
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const envId =
    picked !== undefined
      ? picked
      : preferred === undefined
        ? (envs.data?.[0]?.id ?? null)
        : preferred;
  const list = useQuery({
    ...trpc.testCases.effectiveVariables.queryOptions({ testCaseId, environmentId: envId }),
    enabled: envs.isSuccess,
  });

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border p-3"
      aria-label={tx('ui.variables.effective')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4 text-muted-foreground" aria-hidden />
          {tx('ui.variables.effective')}
        </h3>
        <Select value={envId ?? NONE} onValueChange={(v) => setPicked(v === NONE ? null : v)}>
          <SelectTrigger className="ml-auto h-8 w-52" aria-label={tx('ui.data.envPick')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{tx('ui.variables.noEnvironment')}</SelectItem>
            {(envs.data ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{tx('ui.variables.effectiveHint')}</p>
      {list.data && list.data.length === 0 && (
        <p className="text-sm text-muted-foreground">{tx('ui.variables.effectiveEmpty')}</p>
      )}
      {list.data && list.data.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-medium">{tx('ui.variables.name')}</th>
              <th className="py-1 font-medium">{tx('ui.variables.value')}</th>
              <th className="py-1 font-medium">{tx('ui.variables.level')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((v) => (
              <tr key={v.name} className="border-t align-top">
                <td className="py-1.5 pr-2">
                  <code className="text-xs">{`{{${v.name}}}`}</code>
                </td>
                <td className="max-w-64 py-1.5 pr-2">
                  <span className="break-all">{v.value}</span>
                  {v.overridden.map((o) => (
                    <span
                      key={o.level}
                      className="block text-xs text-muted-foreground line-through"
                    >
                      {tx('ui.variables.overrides', {
                        level: tx(`ui.variables.levels.${o.level}`),
                        value: o.value,
                      })}
                    </span>
                  ))}
                </td>
                <td className="py-1.5">
                  <Badge variant="secondary">{tx(`ui.variables.levels.${v.level}`)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

import { envColor } from '@renderer/lib/environment';
import { useAppStore } from '@renderer/lib/store';
import { trpc } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { cn } from '@renderer/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useRunStore } from '../run/run-store';

export interface EnvLook {
  name: string;
  type?: 'dev' | 'test' | 'uat' | 'staging' | 'production' | 'other' | null;
  color?: string | null;
  protected?: boolean | null;
}

/** Coloured pill naming an environment; red with a shield when protected [O-03, W-10]. */
export function EnvironmentPill({ env, className }: { env: EnvLook; className?: string }) {
  const tx = useTx();
  return (
    <span
      className={cn(
        'inline-flex max-w-56 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        env.protected && 'border-fail bg-fail-soft text-fail-text',
        className,
      )}
      style={env.protected ? undefined : { borderColor: envColor(env) }}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: envColor(env) }}
        aria-hidden
      />
      <span className="truncate">{env.name}</span>
      {env.type && env.type !== 'other' && env.type.toLowerCase() !== env.name.toLowerCase() && (
        <span className="text-muted-foreground">{tx(`ui.environments.types.${env.type}`)}</span>
      )}
      {env.protected && (
        <ShieldAlert className="size-3.5" aria-label={tx('ui.environments.protectedBadge')} />
      )}
    </span>
  );
}

/** Title bar: the environment the next run will use (run options or the first one). */
export function CurrentEnvironmentBadge() {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId);
  const chosen = useRunStore((s) => s.prefs.environmentId);
  const envs = useQuery({
    ...trpc.environments.list.queryOptions({ projectId: projectId ?? '' }),
    enabled: !!projectId,
  });
  if (!envs.data) return null;
  const env =
    chosen === null
      ? undefined
      : chosen === undefined
        ? envs.data[0]
        : envs.data.find((e) => e.id === chosen);
  if (!env) {
    return <span className="text-xs text-muted-foreground">{tx('ui.environments.noCurrent')}</span>;
  }
  return (
    <span title={tx('ui.environments.current', { name: env.name })}>
      <EnvironmentPill env={env} />
    </span>
  );
}

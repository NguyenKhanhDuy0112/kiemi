import {
  ENV_TYPES,
  type EnvType,
  type ProxySettings,
  type SshHop,
  type SshSettings,
} from '@kiemi/schema';
import { EmptyState } from '@renderer/components/empty-state';
import { NameDialog, type NameDialogState } from '@renderer/components/name-dialog';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@renderer/components/ui/sheet';
import { Switch } from '@renderer/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { envColor } from '@renderer/lib/environment';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { cn } from '@renderer/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  ServerCog,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClientCertsForm } from './client-certs';
import { DbConnectionsForm } from './db-connections';
import { EnvironmentPill } from './environment-badge';
import { HttpAuthForm } from './http-auth';
import { PopupRulesEditor } from './popup-rules';

const NONE = '__none__';

interface CellRef {
  environmentId: string;
  productId: string;
}

/** Cell values as stored (`environments.matrix`). */
interface CellValues {
  url: string | null;
  variables: Record<string, string>;
  proxy: ProxySettings | null;
  ssh: SshSettings | null;
}

/**
 * Environment × Product matrix [O-02]: products in rows, environments in
 * columns; each cell = the product's address, variables, proxy and SSH there.
 * Below: variables and secrets of the chosen environment (S-06, G-06, G-07, G-08).
 */
export function EnvironmentsScreen() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const envs = useQuery({
    ...trpc.environments.list.queryOptions({ projectId }),
    enabled: !!projectId,
  });
  const products = useQuery({
    ...trpc.products.list.queryOptions({ projectId }),
    enabled: !!projectId,
  });
  const matrix = useQuery({
    ...trpc.environments.matrix.queryOptions({ projectId }),
    enabled: !!projectId,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [cell, setCell] = useState<CellRef | null>(null);
  const [dialog, setDialog] = useState<NameDialogState | null>(null);
  const list = envs.data ?? [];
  const currentId = list.some((e) => e.id === selected) ? selected : (list[0]?.id ?? null);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: trpc.environments.list.queryKey({ projectId }) }),
      qc.invalidateQueries({ queryKey: trpc.environments.matrix.queryKey({ projectId }) }),
    ]);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const newEnv = () =>
    setDialog({
      title: tx('ui.environments.new'),
      initial: list.length ? '' : 'UAT',
      onSubmit: (name) =>
        run(async () => {
          const env = await trpcClient.environments.create.mutate({ projectId, name });
          setSelected(env.id);
        }),
    });
  const cellOf = (environmentId: string, productId: string) =>
    matrix.data?.find((c) => c.environmentId === environmentId && c.productId === productId);

  if (envs.data && list.length === 0) {
    return (
      <>
        <EmptyState
          icon={Globe}
          title={tx('ui.environments.emptyTitle')}
          text={tx('ui.environments.emptyText')}
          action={
            <Button onClick={newEnv}>
              <Plus /> {tx('ui.environments.new')}
            </Button>
          }
        />
        <NameDialog state={dialog} onClose={() => setDialog(null)} />
      </>
    );
  }

  const productList = products.data ?? [];
  const openCell = cell
    ? {
        ...cell,
        env: list.find((e) => e.id === cell.environmentId),
        product: productList.find((p) => p.id === cell.productId),
      }
    : null;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm text-muted-foreground">{tx('ui.environments.hint')}</p>
          <Button onClick={newEnv}>
            <Plus /> {tx('ui.environments.new')}
          </Button>
        </div>

        <Section
          icon={Globe}
          title={tx('ui.environments.matrix')}
          hint={tx('ui.environments.matrixHint')}
        >
          <Table aria-label={tx('ui.environments.matrix')}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">{tx('ui.environments.product')}</TableHead>
                {list.map((e) => (
                  <TableHead key={e.id} className="min-w-52">
                    <div className="flex items-center gap-1">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: envColor(e) }}
                        aria-hidden
                      />
                      <button
                        type="button"
                        className={cn(
                          'truncate rounded-md px-1.5 py-0.5 text-left hover:bg-accent',
                          e.id === currentId && 'bg-accent font-semibold text-foreground',
                        )}
                        aria-pressed={e.id === currentId}
                        onClick={() => setSelected(e.id)}
                      >
                        {e.name}
                      </button>
                      {e.protected && (
                        <ShieldAlert
                          className="size-3.5 shrink-0 text-fail-text"
                          aria-label={tx('ui.environments.protectedBadge')}
                        />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`${tx('ui.environments.actions')}: ${e.name}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem
                            onSelect={() =>
                              setDialog({
                                title: tx('ui.environments.rename'),
                                initial: e.name,
                                onSubmit: (name) =>
                                  run(() =>
                                    trpcClient.environments.update.mutate({
                                      id: e.id,
                                      patch: { name },
                                    }),
                                  ),
                              })
                            }
                          >
                            <Pencil /> {tx('ui.environments.rename')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              setDialog({
                                title: tx('ui.environments.duplicate'),
                                initial: tx('ui.environments.duplicateName', { name: e.name }),
                                onSubmit: (name) =>
                                  run(async () => {
                                    const copy = await trpcClient.environments.duplicate.mutate({
                                      id: e.id,
                                      name,
                                    });
                                    setSelected(copy.id);
                                    toast.success(tx('ui.environments.duplicated'));
                                  }),
                              })
                            }
                          >
                            <Copy /> {tx('ui.environments.duplicate')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() =>
                              void run(() => trpcClient.environments.remove.mutate({ id: e.id }))
                            }
                          >
                            <Trash2 /> {tx('ui.actions.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {productList.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{p.name}</span>
                      <code className="text-xs text-muted-foreground">{`{{app.${p.key}}}`}</code>
                    </div>
                  </TableCell>
                  {list.map((e) => {
                    const c = cellOf(e.id, p.id);
                    return (
                      <TableCell key={e.id}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full flex-col items-start gap-1 rounded-md border px-2 py-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                            !c && 'border-dashed text-muted-foreground',
                          )}
                          aria-label={tx('ui.environments.cellTitle', {
                            product: p.name,
                            environment: e.name,
                          })}
                          onClick={() => setCell({ environmentId: e.id, productId: p.id })}
                        >
                          {c ? (
                            <>
                              <span className="max-w-60 truncate text-sm">
                                {c.url || tx('ui.environments.addCell')}
                              </span>
                              {(c.ssh?.enabled || c.proxy) && (
                                <span className="flex gap-1">
                                  {c.ssh?.enabled && (
                                    <Badge variant="secondary">
                                      {tx('ui.environments.badgeSsh')}
                                    </Badge>
                                  )}
                                  {c.proxy && (
                                    <Badge variant="secondary">
                                      {tx('ui.environments.badgeProxy')}
                                    </Badge>
                                  )}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="flex items-center gap-1 text-sm">
                              <Plus className="size-3.5" aria-hidden />
                              {tx('ui.environments.notAvailable')}
                            </span>
                          )}
                        </button>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <SharedVariables projectId={projectId} />

        <PopupRulesEditor projectId={projectId} />

        {currentId && (
          <EnvironmentDetails key={currentId} id={currentId} onChanged={() => void refresh()} />
        )}
      </div>

      <Sheet open={!!openCell} onOpenChange={(open) => !open && setCell(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          {openCell?.env && openCell.product && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {tx('ui.environments.cellTitle', {
                    product: openCell.product.name,
                    environment: openCell.env.name,
                  })}
                </SheetTitle>
                <SheetDescription>
                  {tx('ui.environments.cellUrlHint', { environment: openCell.env.name })}
                </SheetDescription>
              </SheetHeader>
              <CellEditor
                key={`${openCell.environmentId}:${openCell.productId}`}
                environmentId={openCell.environmentId}
                productId={openCell.productId}
                productKey={openCell.product.key}
                cell={cellOf(openCell.environmentId, openCell.productId) ?? null}
                onSaved={() => void refresh()}
                onRemoved={() => {
                  toast.success(
                    tx('ui.environments.cellRemoved', {
                      product: openCell.product?.name ?? '',
                      environment: openCell.env?.name ?? '',
                    }),
                  );
                  setCell(null);
                  void refresh();
                }}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
      <NameDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Globe;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
      </h2>
      {hint && <p className="mb-3 text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Name → value rows with a Save button. */
function VariablesEditor({
  initial,
  onSave,
  reference,
}: {
  initial: Record<string, string>;
  onSave: (values: Record<string, string>) => Promise<void>;
  /** How a step refers to a variable, e.g. `{{app.admin.user}}`. */
  reference?: (name: string) => string;
}) {
  const tx = useTx();
  const [vars, setVars] = useState<[string, string][]>(Object.entries(initial));
  const signature = JSON.stringify(initial);
  // Reset when the saved values change (not on every new object identity).
  useEffect(
    () => setVars(Object.entries(JSON.parse(signature) as Record<string, string>)),
    [signature],
  );
  return (
    <>
      {vars.map(([k, v], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional.
        <div key={i} className="flex items-center gap-2">
          <Input
            className="w-44"
            aria-label={tx('ui.variables.name')}
            value={k}
            onChange={(ev) => setVars(vars.map((r, j) => (j === i ? [ev.target.value, r[1]] : r)))}
          />
          <Input
            aria-label={tx('ui.variables.value')}
            value={v}
            onChange={(ev) => setVars(vars.map((r, j) => (j === i ? [r[0], ev.target.value] : r)))}
          />
          {reference && k.trim() && (
            <code className="hidden shrink-0 rounded bg-muted px-1.5 py-1 text-xs md:block">
              {reference(k.trim())}
            </code>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={tx('ui.actions.delete')}
            onClick={() => setVars(vars.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setVars([...vars, ['', '']])}>
          <Plus /> {tx('ui.variables.add')}
        </Button>
        <Button
          size="sm"
          onClick={() => void onSave(Object.fromEntries(vars.filter(([k]) => k.trim())))}
        >
          {tx('common.save')}
        </Button>
      </div>
    </>
  );
}

/** One cell: address, cell variables, proxy, SSH — or remove [O-02, G-06, G-07]. */
function CellEditor({
  environmentId,
  productId,
  productKey,
  cell,
  onSaved,
  onRemoved,
}: {
  environmentId: string;
  productId: string;
  productKey: string;
  cell: CellValues | null;
  onSaved: () => void;
  onRemoved: () => void;
}) {
  const tx = useTx();
  const env = useQuery(trpc.environments.get.queryOptions({ id: environmentId }));
  const [testing, setTesting] = useState(false);
  const cur: CellValues = cell ?? { url: null, variables: {}, proxy: null, ssh: null };
  const save = async (patch: Partial<CellValues>, quiet = false) => {
    try {
      await trpcClient.environments.setCell.mutate({
        environmentId,
        productId,
        cell: { ...cur, ...patch },
      });
      onSaved();
      if (!quiet) toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const secretNames = env.data?.secrets.map((s) => s.name) ?? [];
  const ssh = cur.ssh;
  const saveSsh = (next: SshSettings | null) => void save({ ssh: next });
  const defaultHop: SshHop = { host: '', port: 22, username: '', auth: 'password' };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cell-url">{tx('ui.environments.baseUrl')}</Label>
        <Input
          id="cell-url"
          placeholder={tx('ui.examples.baseUrl')}
          defaultValue={cur.url ?? ''}
          onBlur={(ev) => {
            const url = ev.target.value.trim() || null;
            if (url !== cur.url || !cell) void save({ url });
          }}
        />
        <code className="self-start rounded bg-muted px-1.5 py-1 text-xs">{`{{app.${productKey}}}`}</code>
      </div>

      <Section icon={ServerCog} title={tx('ui.environments.cellVariables')}>
        <VariablesEditor
          initial={cur.variables}
          reference={(n) => `{{app.${productKey}.${n}}}`}
          onSave={(variables) => save({ variables })}
        />
      </Section>

      <Section icon={Globe} title={tx('ui.environments.proxy')}>
        <Input
          aria-label={tx('ui.environments.proxyServer')}
          placeholder={tx('ui.environments.proxyServer')}
          defaultValue={cur.proxy?.server ?? ''}
          onBlur={(ev) => {
            const server = ev.target.value.trim();
            if (server === (cur.proxy?.server ?? '')) return;
            void save({ proxy: server ? { ...(cur.proxy ?? { bypass: [] }), server } : null });
          }}
        />
        {cur.proxy && (
          <Input
            aria-label={tx('ui.environments.proxyBypass')}
            placeholder={tx('ui.environments.proxyBypass')}
            defaultValue={cur.proxy.bypass.join(', ')}
            onBlur={(ev) => {
              const bypass = ev.target.value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
              if (cur.proxy) void save({ proxy: { ...cur.proxy, bypass } });
            }}
          />
        )}
      </Section>

      <Section icon={ServerCog} title={tx('ui.environments.ssh.title')}>
        <div className="flex items-center justify-between">
          <Label htmlFor="ssh-on">{tx('ui.environments.ssh.enabled')}</Label>
          <Switch
            id="ssh-on"
            checked={ssh?.enabled === true}
            // Enabled once the SSH server below has been saved.
            disabled={!ssh}
            onCheckedChange={(on) => ssh && saveSsh({ ...ssh, enabled: on })}
          />
        </div>
        <SshHopForm
          idPrefix="ssh-target"
          hop={ssh?.target ?? defaultHop}
          secretNames={secretNames}
          onSave={(target) =>
            saveSsh({
              enabled: ssh?.enabled ?? true,
              target,
              ...(ssh?.jump ? { jump: ssh.jump } : {}),
            })
          }
        />
        {ssh && (
          <details className="rounded-md border p-3" open={!!ssh.jump}>
            <summary className="cursor-pointer text-sm font-medium">
              {tx('ui.environments.ssh.jump')}
            </summary>
            <div className="mt-3">
              <SshHopForm
                idPrefix="ssh-jump"
                hop={ssh.jump ?? defaultHop}
                secretNames={secretNames}
                onSave={(jump) => saveSsh({ ...ssh, jump })}
              />
            </div>
          </details>
        )}
        {ssh && (
          <Button
            variant="outline"
            className="self-start"
            disabled={testing}
            onClick={async () => {
              setTesting(true);
              try {
                const res = await trpcClient.system.testSsh.mutate({ environmentId, productId });
                if (res.ok) toast.success(tx('ui.environments.ssh.ok', { ms: res.ms }));
                else toast.error(tx('ui.environments.ssh.failed', { reason: res.message }));
              } catch (err) {
                toast.error(errorMessage(err, tx));
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing ? <Loader2 className="animate-spin" /> : <ServerCog />}{' '}
            {testing ? tx('ui.environments.ssh.testing') : tx('ui.environments.ssh.test')}
          </Button>
        )}
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">{tx('ui.environments.ssh.guideTitle')}</p>
          <p>{tx('ui.environments.ssh.guide1')}</p>
          <p>{tx('ui.environments.ssh.guide2')}</p>
          <p>{tx('ui.environments.ssh.guide3')}</p>
          <p>{tx('ui.environments.ssh.guide4')}</p>
        </div>
      </Section>

      {cell && (
        <Button
          variant="ghost"
          className="self-start text-fail-text"
          onClick={async () => {
            try {
              await trpcClient.environments.setCell.mutate({
                environmentId,
                productId,
                cell: null,
              });
              onRemoved();
            } catch (err) {
              toast.error(errorMessage(err, tx));
            }
          }}
        >
          <Trash2 /> {tx('ui.environments.removeCell')}
        </Button>
      )}
    </div>
  );
}

/** Workspace / project / product variables, inherited by every test below [O-04]. */
function SharedVariables({ projectId }: { projectId: string }) {
  const tx = useTx();
  const qc = useQueryClient();
  const settings = useQuery(trpc.system.settings.queryOptions());
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const products = useQuery(trpc.products.list.queryOptions({ projectId }));
  const [level, setLevel] = useState('project');
  const product = level.startsWith('product:')
    ? products.data?.find((p) => p.id === level.slice(8))
    : undefined;
  const initial =
    level === 'workspace'
      ? (settings.data?.workspaceVariables ?? {})
      : level === 'project'
        ? (project.data?.variables ?? {})
        : (product?.variables ?? {});
  const save = async (variables: Record<string, string>) => {
    try {
      if (level === 'workspace') {
        await trpcClient.system.updateSettings.mutate({ workspaceVariables: variables });
        await qc.invalidateQueries({ queryKey: trpc.system.settings.queryKey() });
      } else if (level === 'project') {
        await trpcClient.projects.setVariables.mutate({ id: projectId, variables });
        await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
      } else if (product) {
        await trpcClient.products.setVariables.mutate({ id: product.id, variables });
        await qc.invalidateQueries({ queryKey: trpc.products.list.queryKey({ projectId }) });
      }
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  return (
    <Section icon={Layers} title={tx('ui.variables.shared')} hint={tx('ui.variables.sharedHint')}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="shared-level">{tx('ui.variables.sharedLevel')}</Label>
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger id="shared-level" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="workspace">{tx('ui.variables.levels.workspace')}</SelectItem>
            <SelectItem value="project">{tx('ui.variables.levels.project')}</SelectItem>
            {(products.data ?? []).map((p) => (
              <SelectItem key={p.id} value={`product:${p.id}`}>
                {tx('ui.variables.productLevel', { name: p.name })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <VariablesEditor key={level} initial={initial} onSave={save} reference={(n) => `{{${n}}}`} />
    </Section>
  );
}

/** Variables and secrets shared by every product of one environment (S-06, E-08). */
function EnvironmentDetails({ id, onChanged }: { id: string; onChanged: () => void }) {
  const tx = useTx();
  const qc = useQueryClient();
  const env = useQuery(trpc.environments.get.queryOptions({ id }));
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const reload = async () => {
    await qc.invalidateQueries({ queryKey: trpc.environments.get.queryKey({ id }) });
    onChanged();
  };

  if (!env.data) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  const e = env.data;
  const update = async (
    patch: Parameters<typeof trpcClient.environments.update.mutate>[0]['patch'],
  ) => {
    try {
      await trpcClient.environments.update.mutate({ id, patch });
      await reload();
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">
        {tx('ui.environments.settingsOf', { name: e.name })}
      </h2>
      <Section
        icon={Palette}
        title={tx('ui.environments.type')}
        hint={tx('ui.environments.colorHint')}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="env-type">{tx('ui.environments.type')}</Label>
            <Select value={e.type} onValueChange={(type) => void update({ type: type as EnvType })}>
              <SelectTrigger id="env-type" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENV_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {tx(`ui.environments.types.${t}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="env-color">{tx('ui.environments.color')}</Label>
            <input
              id="env-color"
              type="color"
              className="h-9 w-16 cursor-pointer rounded-md border bg-background p-1"
              value={envColor(e)}
              onChange={(ev) => void update({ color: ev.target.value })}
            />
          </div>
          <EnvironmentPill env={e} className="mb-2" />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor="env-locale">{tx('ui.environments.locale')}</Label>
            <p className="mt-1 text-xs text-muted-foreground">{tx('ui.environments.localeHint')}</p>
          </div>
          <Select
            value={e.locale ?? 'vi'}
            onValueChange={(v) => void update({ locale: v === 'en' ? 'en' : null })}
          >
            <SelectTrigger id="env-locale" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vi">{tx('ui.environments.localeVi')}</SelectItem>
              <SelectItem value="en">{tx('ui.environments.localeEn')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <HttpAuthForm
          key={JSON.stringify(e.httpAuth ?? null)}
          value={e.httpAuth}
          secretNames={e.secrets.map((s) => s.name)}
          onSave={(httpAuth) => void update({ httpAuth })}
        />
        <ClientCertsForm
          key={JSON.stringify(e.clientCerts ?? null)}
          value={e.clientCerts}
          secretNames={e.secrets.map((s) => s.name)}
          onSave={(clientCerts) => void update({ clientCerts })}
        />
        <DbConnectionsForm
          key={JSON.stringify(e.dbConnections ?? null)}
          environmentId={id}
          value={e.dbConnections ?? undefined}
          secretNames={e.secrets.map((s) => s.name)}
          onSave={(dbConnections) => void update({ dbConnections })}
        />
        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor="env-protected" className="flex items-center gap-1.5">
              <ShieldAlert className="size-4 text-fail-text" aria-hidden />
              {tx('ui.environments.protected')}
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {tx('ui.environments.protectedHint')}
            </p>
          </div>
          <Switch
            id="env-protected"
            checked={e.protected}
            onCheckedChange={(on) => void update({ protected: on })}
          />
        </div>
      </Section>
      <Section
        icon={ServerCog}
        title={tx('ui.environments.variables')}
        hint={tx('ui.environments.envVariablesHint')}
      >
        <VariablesEditor
          initial={e.variables}
          reference={(n) => `{{env.${n}}}`}
          onSave={async (variables) => {
            try {
              await trpcClient.environments.setVariables.mutate({ id, variables });
              await reload();
              toast.success(tx('ui.actions.saved'));
            } catch (err) {
              toast.error(errorMessage(err, tx));
            }
          }}
        />
      </Section>

      <Section
        icon={KeyRound}
        title={tx('ui.environments.secrets')}
        hint={tx('ui.environments.secretsHint')}
      >
        {e.secrets.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <code className="w-56 truncate rounded bg-muted px-2 py-1.5 text-xs">{`{{secret.${s.name}}}`}</code>
            <span className="flex-1 font-mono text-sm tracking-widest text-muted-foreground">
              ••••••••
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={tx('ui.actions.delete')}
              onClick={async () => {
                await trpcClient.environments.removeSecret.mutate({ id, name: s.name });
                await reload();
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={async (ev) => {
            ev.preventDefault();
            try {
              await trpcClient.environments.setSecret.mutate({
                id,
                name: secretName.trim(),
                value: secretValue,
              });
              toast.success(tx('ui.environments.secretSaved', { name: secretName.trim() }));
              setSecretName('');
              setSecretValue('');
              await reload();
            } catch (err) {
              toast.error(errorMessage(err, tx));
            }
          }}
        >
          <Input
            className="w-56"
            placeholder={tx('ui.environments.secretName')}
            aria-label={tx('ui.environments.secretName')}
            value={secretName}
            onChange={(ev) => setSecretName(ev.target.value)}
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder={tx('ui.environments.secretValue')}
            aria-label={tx('ui.environments.secretValue')}
            value={secretValue}
            onChange={(ev) => setSecretValue(ev.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!secretName.trim() || !secretValue}>
            {tx('common.save')}
          </Button>
        </form>
      </Section>
    </div>
  );
}

/** One SSH hop: host, port, user, password or key — credentials picked from secrets. */
function SshHopForm({
  idPrefix,
  hop,
  secretNames,
  onSave,
}: {
  idPrefix: string;
  hop: SshHop;
  secretNames: string[];
  onSave: (hop: SshHop) => void;
}) {
  const tx = useTx();
  const [h, setH] = useState<SshHop>(hop);
  const ready =
    h.host.trim() &&
    h.username.trim() &&
    (h.auth === 'password' ? h.passwordSecret : h.privateKeySecret);
  const secretSelect = (
    field: 'passwordSecret' | 'privateKeySecret' | 'passphraseSecret',
    label: string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${idPrefix}-${field}`}>{label}</Label>
      <Select
        value={h[field] ?? NONE}
        onValueChange={(v) =>
          setH((cur) => {
            const next = { ...cur };
            if (v === NONE) delete next[field];
            else next[field] = v;
            return next;
          })
        }
      >
        <SelectTrigger id={`${idPrefix}-${field}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{tx('ui.environments.noSecret')}</SelectItem>
          {secretNames.map((n) => (
            <SelectItem key={n} value={n}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-host`}>{tx('ui.environments.ssh.host')}</Label>
        <Input
          id={`${idPrefix}-host`}
          value={h.host}
          placeholder={tx('ui.examples.sshHost')}
          onChange={(e) => setH({ ...h, host: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-port`}>{tx('ui.environments.ssh.port')}</Label>
        <Input
          id={`${idPrefix}-port`}
          type="number"
          min={1}
          max={65535}
          value={h.port}
          onChange={(e) => setH({ ...h, port: Number(e.target.value) || 22 })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-user`}>{tx('ui.environments.ssh.username')}</Label>
        <Input
          id={`${idPrefix}-user`}
          value={h.username}
          onChange={(e) => setH({ ...h, username: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-auth`}>{tx('ui.environments.ssh.auth')}</Label>
        <Select
          value={h.auth}
          onValueChange={(auth) => setH({ ...h, auth: auth as SshHop['auth'] })}
        >
          <SelectTrigger id={`${idPrefix}-auth`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="password">{tx('ui.enums.password')}</SelectItem>
            <SelectItem value="key">{tx('ui.enums.key')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {h.auth === 'password'
        ? secretSelect('passwordSecret', tx('ui.environments.ssh.passwordSecret'))
        : secretSelect('privateKeySecret', tx('ui.environments.ssh.keySecret'))}
      {h.auth === 'key' &&
        secretSelect('passphraseSecret', tx('ui.environments.ssh.passphraseSecret'))}
      <div className="col-span-2">
        <Button
          size="sm"
          disabled={!ready}
          onClick={() => onSave({ ...h, host: h.host.trim(), username: h.username.trim() })}
        >
          {tx('common.save')}
        </Button>
      </div>
    </div>
  );
}

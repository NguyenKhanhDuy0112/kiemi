import { accessOf, type PermAccess, type PermissionMatrix } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { fileToBase64 } from '@renderer/features/editor/editor-tabs';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Play, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ACCESS_ORDER,
  addFunction,
  addRole,
  newMatrix,
  removeFunction,
  removeRole,
  rolesWithoutLogin,
  setCell,
} from './matrix-edit';

/** How a secret of the environment is written in a step. */
const SECRET_EXAMPLE = '{{secret.matKhau}}';

const TONE: Record<PermAccess, string> = {
  see: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  hidden: 'bg-muted text-muted-foreground',
  blocked: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

/** "Phân quyền": role × function matrix → one test per role [Q-09]. */
export function PermissionsScreen() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const stored = project.data?.permissionMatrices;
  const [list, setList] = useState<PermissionMatrix[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setList(stored ?? []), [stored]);
  const dirty = JSON.stringify(list) !== JSON.stringify(stored ?? []);
  const current = list.find((m) => m.id === selected) ?? null;
  const change = (m: PermissionMatrix) => setList((all) => all.map((x) => (x.id === m.id ? m : x)));

  const save = async () => {
    try {
      await trpcClient.projects.setPermissionMatrices.mutate({ id: projectId, matrices: list });
      await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const readFile = async (file: File) => {
    try {
      const { matrix, warnings } = await trpcClient.permissions.fromExcel.mutate({
        data: await fileToBase64(file),
        fileName: file.name,
      });
      if (matrix.functions.length === 0) {
        toast.info(tx('ui.permissions.excelNone'));
        return;
      }
      setList((all) => [...all, matrix as PermissionMatrix]);
      setSelected(matrix.id);
      toast.success(
        tx('ui.permissions.imported', {
          roles: matrix.roles.length,
          functions: matrix.functions.length,
        }),
      );
      for (const w of warnings.slice(0, 5)) toast.warning(w);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };
  const downloadTemplate = async () => {
    try {
      const r = await trpcClient.permissions.template.query();
      const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kiemi-phan-quyen-mau.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-testid="permissions-screen">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
          {tx('ui.permissions.title')}
        </h1>
        <p className="basis-full text-sm text-muted-foreground">{tx('ui.permissions.hint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <FileSpreadsheet /> {tx('ui.permissions.fromExcel')}
              <input
                type="file"
                accept=".xlsx"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                  e.target.value = '';
                }}
              />
            </label>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void downloadTemplate()}>
            <Download /> {tx('ui.permissions.template')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const m = newMatrix(tx('ui.permissions.newName'));
              setList((all) => [...all, m]);
              setSelected(m.id);
            }}
          >
            <Plus /> {tx('ui.permissions.add')}
          </Button>
          <Button size="sm" disabled={!dirty} onClick={() => void save()}>
            {tx('ui.actions.save')}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-4">
        <ul
          className="w-56 shrink-0 overflow-auto rounded-md border"
          aria-label={tx('ui.permissions.title')}
        >
          {list.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">{tx('ui.permissions.empty')}</li>
          )}
          {list.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelected(m.id)}
                className={`w-full truncate px-3 py-2 text-left text-sm hover:bg-accent ${m.id === selected ? 'bg-accent' : ''}`}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 flex-1 overflow-auto">
          {current ? (
            <MatrixEditor
              key={current.id}
              value={current}
              saved={!dirty && (stored ?? []).some((m) => m.id === current.id)}
              onChange={change}
              onRemove={() => {
                setList((all) => all.filter((x) => x.id !== current.id));
                setSelected(null);
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{tx('ui.permissions.pick')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MatrixEditor({
  value: m,
  saved,
  onChange,
  onRemove,
}: {
  value: PermissionMatrix;
  saved: boolean;
  onChange: (m: PermissionMatrix) => void;
  onRemove: () => void;
}) {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const [roleName, setRoleName] = useState('');
  const [fnName, setFnName] = useState('');
  const noLogin = rolesWithoutLogin(m);

  const generate = async () => {
    try {
      const r = await trpcClient.permissions.generate.mutate({ projectId, matrixId: m.id });
      await qc.invalidateQueries({ queryKey: trpc.testCases.list.queryKey() });
      await qc.invalidateQueries({ queryKey: trpc.folders.list.queryKey({ projectId }) });
      toast.success(tx('ui.permissions.generated', { created: r.created, updated: r.updated }));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={m.name}
          aria-label={tx('ui.permissions.name')}
          onChange={(e) => onChange({ ...m, name: e.target.value })}
        />
        <Input
          value={m.homePath}
          aria-label={tx('ui.permissions.homePath')}
          placeholder={tx('ui.permissions.homePath')}
          onChange={(e) => onChange({ ...m, homePath: e.target.value })}
        />
        <Input
          value={m.loginPath}
          aria-label={tx('ui.permissions.loginPath')}
          placeholder={tx('ui.permissions.loginPath')}
          onChange={(e) => onChange({ ...m, loginPath: e.target.value })}
        />
        <Input
          value={m.deniedText}
          aria-label={tx('ui.permissions.deniedText')}
          placeholder={tx('ui.permissions.deniedText')}
          onChange={(e) => onChange({ ...m, deniedText: e.target.value })}
        />
      </div>

      <section aria-label={tx('ui.permissions.roles')} className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{tx('ui.permissions.roles')}</h2>
        <p className="text-xs text-muted-foreground">
          {tx('ui.permissions.passwordHint', { example: SECRET_EXAMPLE })}
        </p>
        {m.roles.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center gap-2">
            <span className="w-32 truncate text-sm">{r.name}</span>
            <Input
              className="h-8 w-44"
              value={r.username}
              placeholder={tx('ui.permissions.username')}
              aria-label={`${r.name}: ${tx('ui.permissions.username')}`}
              onChange={(e) =>
                onChange({
                  ...m,
                  roles: m.roles.map((x) =>
                    x.key === r.key ? { ...x, username: e.target.value } : x,
                  ),
                })
              }
            />
            <Input
              className="h-8 w-52"
              value={r.password}
              placeholder={SECRET_EXAMPLE}
              aria-label={`${r.name}: ${tx('ui.permissions.password')}`}
              onChange={(e) =>
                onChange({
                  ...m,
                  roles: m.roles.map((x) =>
                    x.key === r.key ? { ...x, password: e.target.value } : x,
                  ),
                })
              }
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={tx('ui.permissions.removeRole')}
              onClick={() => onChange(removeRole(m, r.key))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            className="h-8 w-44"
            value={roleName}
            placeholder={tx('ui.permissions.roleName')}
            aria-label={tx('ui.permissions.roleName')}
            onChange={(e) => setRoleName(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!roleName.trim()}
            onClick={() => {
              onChange(addRole(m, roleName.trim()));
              setRoleName('');
            }}
          >
            <Plus /> {tx('ui.permissions.addRole')}
          </Button>
        </div>
      </section>

      <section aria-label={tx('ui.permissions.matrix')} className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="font-normal">{tx('ui.permissions.function')}</th>
              <th className="font-normal">{tx('ui.permissions.path')}</th>
              {m.roles.map((r) => (
                <th key={r.key} className="font-normal">
                  {r.name}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {m.functions.map((f) => (
              <tr key={f.key}>
                <td className="pr-2">{f.name}</td>
                <td className="pr-2">
                  <Input
                    className="h-8 w-56"
                    value={f.path}
                    aria-label={`${f.name}: ${tx('ui.permissions.path')}`}
                    onChange={(e) =>
                      onChange({
                        ...m,
                        functions: m.functions.map((x) =>
                          x.key === f.key ? { ...x, path: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </td>
                {m.roles.map((r) => {
                  const a = accessOf(m, r.key, f.key);
                  return (
                    <td key={r.key} className="pr-2">
                      <select
                        className={`h-8 rounded-md border px-2 ${TONE[a]}`}
                        aria-label={`${r.name} × ${f.name}`}
                        value={a}
                        onChange={(e) =>
                          onChange(setCell(m, r.key, f.key, e.target.value as PermAccess))
                        }
                      >
                        {ACCESS_ORDER.map((x) => (
                          <option key={x} value={x}>
                            {tx(`ui.permissions.access.${x}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
                <td>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={tx('ui.permissions.removeFunction')}
                    onClick={() => onChange(removeFunction(m, f.key))}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex gap-2">
          <Input
            className="h-8 w-56"
            value={fnName}
            placeholder={tx('ui.permissions.functionName')}
            aria-label={tx('ui.permissions.functionName')}
            onChange={(e) => setFnName(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!fnName.trim()}
            onClick={() => {
              onChange(addFunction(m, fnName.trim(), '/'));
              setFnName('');
            }}
          >
            <Plus /> {tx('ui.permissions.addFunction')}
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!saved || m.roles.length === 0 || m.functions.length === 0}
          onClick={() => void generate()}
        >
          <Play /> {tx('ui.permissions.generate')}
        </Button>
        {!saved && (
          <span className="text-xs text-muted-foreground">{tx('ui.permissions.saveFirst')}</span>
        )}
        {noLogin.length > 0 && (
          <span className="text-xs text-amber-700 dark:text-amber-400" role="status">
            {tx('ui.permissions.noLogin', { roles: noLogin.join(', ') })}
          </span>
        )}
        <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={onRemove}>
          <Trash2 /> {tx('ui.permissions.remove')}
        </Button>
      </div>
    </div>
  );
}

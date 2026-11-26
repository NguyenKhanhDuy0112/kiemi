import type { PopupRule } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
import { errorMessage } from '@renderer/lib/errors';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/** A rule as the form edits it: popup text → text of the button, or Esc. */
interface Row {
  id: string;
  name: string;
  enabled: boolean;
  when: string;
  action: 'click' | 'escape';
  button: string;
}

const textOf = (l: { strategies: { kind: string; value?: string }[] } | undefined) =>
  l?.strategies.find((s) => s.kind === 'text')?.value ?? '';
const byText = (value: string) => ({ strategies: [{ kind: 'text' as const, value }] });

const toRow = (r: PopupRule): Row => ({
  id: r.id,
  name: r.name,
  enabled: r.enabled,
  when: textOf(r.when),
  action: r.action.kind,
  button: r.action.kind === 'click' ? textOf(r.action.target) : '',
});

const toRule = (r: Row): PopupRule => ({
  id: r.id,
  name: r.name.trim(),
  enabled: r.enabled,
  when: byText(r.when.trim()),
  action:
    r.action === 'escape' ? { kind: 'escape' } : { kind: 'click', target: byText(r.button.trim()) },
});

/**
 * "Popup tự đóng": if the page shows X, press Y — for every test of the project,
 * so a random popup does not fail a run [W-09].
 */
export function PopupRulesEditor({ projectId }: { projectId: string }) {
  const tx = useTx();
  const qc = useQueryClient();
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const [rows, setRows] = useState<Row[]>([]);
  const stored = project.data?.popupRules;
  useEffect(() => setRows((stored ?? []).map(toRow)), [stored]);

  const patch = (id: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const complete = rows.every(
    (r) => r.name.trim() && r.when.trim() && (r.action === 'escape' || r.button.trim()),
  );

  const save = async () => {
    try {
      await trpcClient.projects.setPopupRules.mutate({ id: projectId, rules: rows.map(toRule) });
      await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <BellOff className="size-4 text-muted-foreground" aria-hidden /> {tx('ui.popups.title')}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">{tx('ui.popups.hint')}</p>
      <div className="flex flex-col gap-3">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">{tx('ui.popups.empty')}</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="grid items-end gap-2 rounded-md border p-3 md:grid-cols-12">
            <div className="flex flex-col gap-1 text-xs md:col-span-3">
              {tx('ui.popups.name')}
              <Input
                aria-label={tx('ui.popups.name')}
                value={r.name}
                onChange={(e) => patch(r.id, { name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1 text-xs md:col-span-3">
              {tx('ui.popups.when')}
              <Input
                aria-label={tx('ui.popups.when')}
                value={r.when}
                placeholder={tx('ui.popups.whenHint')}
                onChange={(e) => patch(r.id, { when: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1 text-xs md:col-span-2">
              {tx('ui.popups.doThis')}
              <Select
                value={r.action}
                onValueChange={(v) => patch(r.id, { action: v as Row['action'] })}
              >
                <SelectTrigger aria-label={tx('ui.popups.doThis')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="click">{tx('ui.popups.click')}</SelectItem>
                  <SelectItem value="escape">{tx('ui.popups.escape')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 text-xs md:col-span-2">
              {tx('ui.popups.button')}
              <Input
                aria-label={tx('ui.popups.button')}
                value={r.button}
                disabled={r.action === 'escape'}
                onChange={(e) => patch(r.id, { button: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2 md:justify-end">
              <Switch
                checked={r.enabled}
                aria-label={tx('ui.popups.enabled')}
                onCheckedChange={(enabled) => patch(r.id, { enabled })}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={tx('ui.popups.remove')}
                onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                {
                  id: `popup-${Date.now().toString(36)}`,
                  name: '',
                  enabled: true,
                  when: '',
                  action: 'click',
                  button: '',
                },
              ])
            }
          >
            <Plus /> {tx('ui.popups.add')}
          </Button>
          <Button size="sm" disabled={!complete} onClick={() => void save()}>
            {tx('common.save')}
          </Button>
        </div>
      </div>
    </section>
  );
}

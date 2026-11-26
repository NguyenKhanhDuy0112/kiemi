import type { FormSpec } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FieldRow } from './field-row';
import { cleanField, firstFormProblem, newField, newForm } from './form-edit';
import { InferPanel } from './infer-panel';

/**
 * "Biểu mẫu": the field specification of each form of the project — type and
 * rules per field — the base for generated validation tests [R-01].
 */
export function FormsScreen() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  const stored = project.data?.formSpecs;
  const [forms, setForms] = useState<FormSpec[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const list = stored ?? [];
    setForms(list);
    setCurrent((c) => (c && list.some((f) => f.id === c) ? c : (list[0]?.id ?? null)));
  }, [stored]);

  const form = forms.find((f) => f.id === current);
  const patch = (next: FormSpec) => setForms((fs) => fs.map((f) => (f.id === next.id ? next : f)));
  const dirty = JSON.stringify(forms) !== JSON.stringify(stored ?? []);

  const addForm = () => {
    const f = newForm(`form-${Date.now().toString(36)}`, tx('ui.forms.newName'));
    setForms((fs) => [...fs, f]);
    setCurrent(f.id);
  };

  /** Forms read from a page / schema join the list for the QC to review, then Save. */
  const addInferred = (list: FormSpec[]) => {
    setForms((fs) => [...fs, ...list]);
    setCurrent(list[0]?.id ?? null);
  };

  const save = async () => {
    const cleaned = forms.map((f) => ({ ...f, fields: f.fields.map(cleanField) }));
    const problem = firstFormProblem(cleaned);
    if (problem) {
      toast.error(tx('ui.forms.invalid', { problem }));
      return;
    }
    try {
      await trpcClient.projects.setFormSpecs.mutate({ id: projectId, forms: cleaned });
      await qc.invalidateQueries({ queryKey: trpc.projects.get.queryKey({ id: projectId }) });
      toast.success(tx('ui.actions.saved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="forms-screen"
    >
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardList className="size-5 text-muted-foreground" aria-hidden />
          {tx('ui.forms.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{tx('ui.forms.hint')}</p>
      </header>
      <InferPanel projectId={projectId} onAdd={addInferred} />
      <div className="flex flex-wrap items-center gap-2">
        {forms.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={f.id === current ? 'default' : 'outline'}
            onClick={() => setCurrent(f.id)}
          >
            {f.name || tx('ui.forms.newName')}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={addForm}>
          <Plus /> {tx('ui.forms.addForm')}
        </Button>
        <Button size="sm" className="ml-auto" disabled={!dirty} onClick={() => void save()}>
          {tx('common.save')}
        </Button>
      </div>
      {!form ? (
        <p className="text-sm text-muted-foreground">{tx('ui.forms.empty')}</p>
      ) : (
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="grid gap-2 md:grid-cols-12">
            <div className="flex flex-col gap-1 text-xs md:col-span-4">
              {tx('ui.forms.formName')}
              <Input
                aria-label={tx('ui.forms.formName')}
                value={form.name}
                onChange={(e) => patch({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1 text-xs md:col-span-4">
              {tx('ui.forms.path')}
              <Input
                aria-label={tx('ui.forms.path')}
                value={form.path ?? ''}
                placeholder={tx('ui.forms.pathHint')}
                onChange={(e) => patch({ ...form, path: e.target.value })}
              />
            </div>
            <div className="flex items-end md:col-span-4 md:justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setForms((fs) => fs.filter((f) => f.id !== form.id));
                  setCurrent(null);
                }}
              >
                <Trash2 /> {tx('ui.forms.removeForm')}
              </Button>
            </div>
          </div>
          {form.fields.length === 0 && (
            <p className="text-sm text-muted-foreground">{tx('ui.forms.noFields')}</p>
          )}
          {form.fields.map((f, i) => (
            <FieldRow
              // biome-ignore lint/suspicious/noArrayIndexKey: fields have no id and editing the key must not remount the row
              key={i}
              form={form}
              field={f}
              onChange={(next) =>
                patch({ ...form, fields: form.fields.map((x, j) => (j === i ? next : x)) })
              }
              onRemove={() => patch({ ...form, fields: form.fields.filter((_, j) => j !== i) })}
            />
          ))}
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => patch({ ...form, fields: [...form.fields, newField(form)] })}
            >
              <Plus /> {tx('ui.forms.addField')}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

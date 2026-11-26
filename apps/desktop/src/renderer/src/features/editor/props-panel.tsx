import type { Step, TestCase } from '@kiemi/schema';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@renderer/components/ui/collapsible';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Textarea } from '@renderer/components/ui/textarea';
import { byType, useActions } from '@renderer/lib/actions';
import { useTx } from '@renderer/lib/tx';
import { ChevronRight } from 'lucide-react';
import { findStep, updateStep } from './doc-model';
import { useEditorStore } from './editor-store';
import { type JsonSchema, SchemaForm } from './schema-form';

/** Right panel: details of the selected step (M3-03, U-01, U-04). */
export function PropsPanel({ focusParam }: { focusParam: string | null }) {
  const tx = useTx();
  const doc = useEditorStore((s) => s.doc);
  const selectedId = useEditorStore((s) => s.selectedId);
  const apply = useEditorStore((s) => s.apply);
  const step = doc && selectedId ? findStep(doc, selectedId) : undefined;
  if (!doc || !step) {
    return <p className="p-4 text-sm text-muted-foreground">{tx('ui.editor.selectStep')}</p>;
  }
  return (
    <StepForm
      doc={doc}
      step={step}
      focusParam={focusParam}
      onPatch={(p) => apply((d) => updateStep(d, step.id, p))}
    />
  );
}

/** Form of one step; shared by the editor and the Run screen [FX-02]. */
export function StepForm({
  doc,
  step,
  focusParam,
  onPatch: patch,
}: {
  doc: TestCase;
  step: Step;
  focusParam: string | null;
  onPatch: (p: Parameters<typeof updateStep>[2]) => void;
}) {
  const tx = useTx();
  const { data: actions } = useActions();
  const info = byType(actions).get(step.action);

  return (
    <section className="flex flex-col gap-4 p-4" aria-label={tx('ui.props.title')}>
      <div>
        <p className="text-xs text-muted-foreground">{tx(`ui.groups.${info?.group ?? 'input'}`)}</p>
        <h2 className="text-base font-semibold">
          {tx(`ui.steps.${step.action}.label`, undefined, step.action)}
        </h2>
      </div>
      {info && (
        <SchemaForm
          key={step.id}
          schema={info.schema as JsonSchema}
          rawParams={info.rawParams}
          value={step.params}
          elements={doc.elements}
          focus={focusParam}
          onChange={(params) => patch({ params })}
        />
      )}
      <Collapsible className="rounded-md border">
        <CollapsibleTrigger className="group flex w-full items-center gap-1 px-3 py-2 text-sm font-medium">
          <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
          {tx('ui.props.advanced')}
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 px-3 pb-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="step-name">{tx('ui.props.name')}</Label>
            <Input
              id="step-name"
              value={step.name ?? ''}
              onChange={(e) =>
                patch(e.target.value ? { name: e.target.value } : { name: undefined })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="step-session">{tx('ui.props.session')}</Label>
            <Select value={step.session} onValueChange={(session) => patch({ session })}>
              <SelectTrigger id="step-session" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {doc.sessions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="step-mode">{tx('ui.props.mode')}</Label>
            <Select
              value={step.mode}
              onValueChange={(mode) => patch({ mode: mode as 'hard' | 'soft' })}
            >
              <SelectTrigger id="step-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hard">{tx('ui.enums.hard')}</SelectItem>
                <SelectItem value="soft">{tx('ui.enums.soft')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="step-timeout">{tx('ui.props.timeout')}</Label>
            <Input
              id="step-timeout"
              type="number"
              min={1}
              placeholder={tx('ui.props.timeoutHint')}
              value={step.timeoutMs === undefined ? '' : step.timeoutMs / 1000}
              onChange={(e) => {
                const sec = Number(e.target.value);
                patch(
                  e.target.value === '' || !(sec > 0)
                    ? { timeoutMs: undefined }
                    : { timeoutMs: Math.round(sec * 1000) },
                );
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="step-note">{tx('ui.props.note')}</Label>
            <Textarea
              id="step-note"
              value={step.note ?? ''}
              onChange={(e) =>
                patch(e.target.value ? { note: e.target.value } : { note: undefined })
              }
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Step } from '@kiemi/schema';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { groupActions, useActions } from '@renderer/lib/actions';
import { useTx } from '@renderer/lib/tx';
import { cn } from '@renderer/lib/utils';
import {
  Copy,
  EyeOff,
  GripVertical,
  ListPlus,
  MoreHorizontal,
  OctagonPause,
  Power,
  StepForward,
  Trash2,
} from 'lucide-react';
import { memo, useMemo } from 'react';
import { toast } from 'sonner';
import { useRunStore } from '../run/run-store';
import { StepStatusIcon } from '../run/step-status';
import {
  defaultParams,
  duplicateStep,
  flatten,
  insertStep,
  type ListRef,
  moveStep,
  newStepId,
  type Row,
  removeStep,
  sameList,
  toggleStep,
} from './doc-model';
import { useEditorStore } from './editor-store';
import { StepSentence } from './step-sentence';

/** Adds a step of `type` after the selected one (or into `list`), then selects it. */
export function useAddStep() {
  const { data: actions } = useActions();
  const apply = useEditorStore((s) => s.apply);
  const select = useEditorStore((s) => s.select);
  return (type: string, list?: ListRef) => {
    const info = actions?.find((a) => a.type === type);
    let createdId = '';
    apply((doc) => {
      createdId = newStepId(doc);
      const sel = useEditorStore.getState().selectedId;
      const step: Step = {
        id: createdId,
        action: type,
        params: info ? defaultParams(info.schema) : {},
        session: doc.sessions[0] ?? 'default',
        enabled: true,
        mode: 'hard',
      };
      return insertStep(doc, step, list ? { list } : { afterId: sel });
    });
    if (createdId) select(createdId);
  };
}

/** "Thêm bước" menu grouped like the SPEC (navigation, input, … assert). */
export function AddStepMenu({
  list,
  variant = 'default',
}: {
  list?: ListRef;
  variant?: 'default' | 'outline' | 'ghost';
}) {
  const tx = useTx();
  const { data: actions } = useActions();
  const add = useAddStep();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm">
          <ListPlus /> {tx('ui.editor.addStep')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{tx('ui.editor.addStepHint')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {groupActions(actions ?? []).map((g) => (
          <DropdownMenuSub key={g.group}>
            <DropdownMenuSubTrigger>
              {tx(`ui.groups.${g.group}`, undefined, g.group)}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-96 overflow-auto">
              {g.actions.map((a) => (
                <DropdownMenuItem key={a.type} onSelect={() => add(a.type, list)}>
                  {tx(`ui.steps.${a.type}.label`, undefined, a.type)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Deletes a step with an undo toast instead of a confirmation dialog (U-08). */
export function useDeleteStep() {
  const tx = useTx();
  const apply = useEditorStore((s) => s.apply);
  const undo = useEditorStore((s) => s.undo);
  const select = useEditorStore((s) => s.select);
  return (step: Step) => {
    apply((d) => removeStep(d, step.id));
    select(null);
    toast(
      tx('ui.actions.deleted', {
        name: tx(`ui.steps.${step.action}.label`, undefined, step.action),
      }),
      {
        action: { label: tx('common.undo'), onClick: () => undo() },
      },
    );
  };
}

interface StepRowProps {
  row: Row;
  sharedNames: ReadonlyMap<string, string>;
  onChip: (id: string, param: string) => void;
  onRunFrom?: ((stepId: string) => void) | undefined;
}

/** Rows only re-render when their own step (or position) changes (N-05: 200 steps stay smooth). */
export function sameRowProps(a: StepRowProps, b: StepRowProps): boolean {
  return (
    a.row.step === b.row.step &&
    a.row.depth === b.row.depth &&
    a.row.no === b.row.no &&
    a.row.index === b.row.index &&
    sameList(a.row.list, b.row.list) &&
    a.sharedNames === b.sharedNames &&
    a.onChip === b.onChip &&
    a.onRunFrom === b.onRunFrom
  );
}

const StepRow = memo(function StepRow({ row, sharedNames, onChip, onRunFrom }: StepRowProps) {
  const tx = useTx();
  // Narrow subscriptions: editing one step must not re-render the other rows (N-05).
  const elements = useEditorStore((s) => s.doc?.elements);
  const multiSession = useEditorStore((s) => (s.doc?.sessions.length ?? 1) > 1);
  const testId = useEditorStore((s) => s.testId);
  const hasBreakpoint = useRunStore(
    (s) => !!testId && (s.breakpoints[testId] ?? []).includes(row.step.id),
  );
  const toggleBreakpoint = useRunStore((s) => s.toggleBreakpoint);
  const latestRunId = useRunStore((s) => (testId ? s.latestByTest[testId] : undefined));
  const selected = useEditorStore((s) => s.selectedId === row.step.id);
  const select = useEditorStore((s) => s.select);
  const apply = useEditorStore((s) => s.apply);
  const del = useDeleteStep();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.step.id,
  });
  const { step } = row;
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        paddingLeft: `${row.depth * 24 + 4}px`,
      }}
      className={cn(
        'group flex items-center gap-2 border-b py-1.5 pr-2 text-sm',
        selected && 'bg-accent',
        !step.enabled && 'opacity-55',
        isDragging && 'relative z-10 bg-background shadow-md',
      )}
      data-selected={selected || undefined}
      onClick={() => select(step.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') select(step.id);
      }}
      data-step={step.id}
    >
      <button
        type="button"
        className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted"
        aria-label={tx('ui.editor.dragHandle')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        className={cn(
          'relative w-9 shrink-0 rounded text-right text-xs tabular-nums text-muted-foreground hover:bg-muted',
          hasBreakpoint && 'font-semibold text-fail-text',
        )}
        title={tx(hasBreakpoint ? 'ui.run.breakpointRemove' : 'ui.run.breakpointAdd')}
        aria-pressed={hasBreakpoint}
        aria-label={`${row.no} · ${tx(hasBreakpoint ? 'ui.run.breakpointRemove' : 'ui.run.breakpointAdd')}`}
        onClick={(e) => {
          e.stopPropagation();
          if (testId) toggleBreakpoint(testId, step.id, latestRunId);
        }}
      >
        {hasBreakpoint && (
          <span className="absolute top-1/2 left-0.5 size-2 -translate-y-1/2 rounded-full bg-fail" />
        )}
        {row.no}
      </button>
      <StepStatusIcon testId={testId} stepId={step.id} />
      <div className="min-w-0 flex-1">
        {elements && (
          <StepSentence
            step={step}
            elements={elements}
            sharedNames={sharedNames}
            onChipClick={(p) => onChip(step.id, p)}
          />
        )}
      </div>
      {multiSession && <Badge variant="secondary">{step.session}</Badge>}
      {step.tab && <Badge variant="outline">{tx('ui.editor.tabBadge', { name: step.tab })}</Badge>}
      {step.mode === 'soft' && <Badge variant="outline">{tx('ui.editor.soft')}</Badge>}
      {!step.enabled && (
        <Badge variant="outline">
          <EyeOff /> {tx('ui.editor.disabled')}
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
            aria-label={tx('ui.actions.more')}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              let newId: string | undefined;
              apply((d) => {
                const r = duplicateStep(d, step.id);
                newId = r.newId;
                return r.doc;
              });
              if (newId) select(newId);
            }}
          >
            <Copy /> {tx('ui.actions.duplicate')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => apply((d) => toggleStep(d, step.id))}>
            <Power /> {step.enabled ? tx('ui.editor.disable') : tx('ui.editor.enable')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => testId && toggleBreakpoint(testId, step.id, latestRunId)}
          >
            <OctagonPause />{' '}
            {tx(hasBreakpoint ? 'ui.run.breakpointRemove' : 'ui.run.breakpointAdd')}
          </DropdownMenuItem>
          {row.list.kind === 'root' && onRunFrom && (
            <DropdownMenuItem onSelect={() => onRunFrom(step.id)}>
              <StepForward /> {tx('ui.run.runFromHere')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => del(step)}>
            <Trash2 /> {tx('ui.actions.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}, sameRowProps);

// Constant options: new objects would change the drag context and re-render every row.
const POINTER_OPTIONS = { activationConstraint: { distance: 4 } };
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

/** The step table (S-02): sentences, drag & drop, enable/disable, duplicate, delete. */
export const StepTable = memo(function StepTable({
  sharedNames,
  onChip,
  onRunFrom,
}: {
  sharedNames: ReadonlyMap<string, string>;
  onChip: (id: string, param: string) => void;
  onRunFrom?: (stepId: string) => void;
}) {
  const tx = useTx();
  const doc = useEditorStore((s) => s.doc);
  const apply = useEditorStore((s) => s.apply);
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );
  const rows = useMemo(() => (doc ? flatten(doc) : []), [doc]);
  // Same ids → same array, so the sortable context does not re-render every row.
  const idKey = rows.map((r) => r.step.id).join('\n');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `idKey` stands for the ids in order.
  const items = useMemo(() => rows.map((r) => r.step.id), [idKey]);
  if (!doc) return null;
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = rows.find((r) => r.step.id === e.active.id);
    const to = rows.find((r) => r.step.id === e.over?.id);
    if (!from || !to || !sameList(from.list, to.list)) return;
    apply((d) => moveStep(d, from.step.id, to.index));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col" aria-label={tx('ui.editor.tabs.steps')}>
          {rows.map((row) => (
            <StepRow
              key={row.step.id}
              row={row}
              sharedNames={sharedNames}
              onChip={onChip}
              onRunFrom={onRunFrom}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
});

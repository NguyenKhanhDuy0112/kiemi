import type { LocatorStrategy, TestCase } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
import { Textarea } from '@renderer/components/ui/textarea';
import { useTx } from '@renderer/lib/tx';
import { Crosshair, Loader2, Plus, ScanEye, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { toLocator } from '../record/apply-changes';
import { useEditorStore } from './editor-store';
import { usePickSource } from './pick-context';
import { ROLES, type TargetKind, targetKindsFor, useAdvancedMode } from './strategies';
import { StrategiesEditor } from './strategies-editor';
import { VariableInput } from './variable-input';

export type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: JsonSchema | boolean;
  default?: unknown;
  minimum?: number;
  maximum?: number;
};

export type FieldKind =
  | { kind: 'target' }
  | { kind: 'text' }
  | { kind: 'number'; integer: boolean; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'list' }
  | { kind: 'map' }
  | { kind: 'nested' }
  | { kind: 'json' };

const variants = (s: JsonSchema): JsonSchema[] => s.anyOf ?? s.oneOf ?? [];

/** Decides which control a JSON Schema property gets (M3-03). Pure for tests. */
export function fieldKind(name: string, s: JsonSchema, rawParams: readonly string[]): FieldKind {
  if (name === 'target') return { kind: 'target' };
  if (name === 'steps' || name === 'elseSteps') return { kind: 'nested' };
  if (rawParams.includes(name)) return { kind: 'json' };
  if (Array.isArray(s.enum) && s.enum.every((v) => typeof v === 'string'))
    return { kind: 'enum', values: s.enum as string[] };
  const vs = variants(s);
  if (vs.length && vs.every((v) => typeof v.const === 'string'))
    return { kind: 'enum', values: vs.map((v) => v.const as string) };
  const types = new Set([
    ...(Array.isArray(s.type) ? s.type : s.type ? [s.type] : []),
    ...vs.flatMap((v) => (Array.isArray(v.type) ? v.type : v.type ? [v.type] : [])),
  ]);
  if (types.has('string')) {
    if (vs.some((v) => v.type === 'array')) return { kind: 'list' }; // string | string[] (files)
    return { kind: 'text' };
  }
  if (types.has('boolean') && types.size === 1) return { kind: 'boolean' };
  if (types.has('integer') || types.has('number')) {
    return {
      kind: 'number',
      integer: types.has('integer') && !types.has('number'),
      ...(s.minimum === undefined ? {} : { min: s.minimum }),
      ...(s.maximum === undefined ? {} : { max: s.maximum }),
    };
  }
  if (
    types.has('array') &&
    s.items &&
    (s.items.type === 'string' || variants(s.items).some((v) => v.type === 'string'))
  )
    return { kind: 'list' };
  if (
    types.has('object') &&
    s.additionalProperties &&
    typeof s.additionalProperties === 'object' &&
    !s.properties
  )
    return { kind: 'map' };
  return { kind: 'json' };
}

interface FormProps {
  schema: JsonSchema;
  rawParams: readonly string[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  elements: TestCase['elements'];
  /** Params shown first (the "main" ones); others follow. */
  focus?: string | null;
}

/** The step's parameter form, generated from the action's params schema. */
export function SchemaForm({ schema, rawParams, value, onChange, elements, focus }: FormProps) {
  const tx = useTx();
  const props = Object.entries(schema.properties ?? {});
  const required = new Set(schema.required ?? []);
  return (
    <div className="flex flex-col gap-4">
      {props.map(([name, s]) => {
        const kind = fieldKind(name, s, rawParams);
        const set = (v: unknown) => {
          const next = { ...value };
          if (v === undefined || v === '') delete next[name];
          else next[name] = v;
          onChange(next);
        };
        return (
          <Field
            key={name}
            name={name}
            label={tx(`ui.params.${name}`, undefined, name)}
            required={required.has(name) && s.default === undefined}
            kind={kind}
            value={value[name] ?? s.default}
            onChange={set}
            elements={elements}
            autoFocus={focus === name}
          />
        );
      })}
    </div>
  );
}

function Field({
  name,
  label,
  required,
  kind,
  value,
  onChange,
  elements,
  autoFocus,
}: {
  name: string;
  label: string;
  required: boolean;
  kind: FieldKind;
  value: unknown;
  onChange: (v: unknown) => void;
  elements: TestCase['elements'];
  autoFocus: boolean;
}) {
  const tx = useTx();
  const id = useId();
  const head = (
    <Label htmlFor={id} className="text-[13px]">
      {label}
      {required && (
        <>
          <span className="text-destructive" aria-hidden>
            {' '}
            *
          </span>
          <span className="sr-only">{tx('ui.props.required')}</span>
        </>
      )}
    </Label>
  );
  switch (kind.kind) {
    case 'target':
      return (
        <div className="flex flex-col gap-1.5" data-field={name}>
          {head}
          <TargetField id={id} value={value} onChange={onChange} elements={elements} />
        </div>
      );
    case 'nested':
      return (
        <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground" data-field={name}>
          {label}: {tx('ui.props.nestedHint')}
        </p>
      );
    case 'boolean':
      return (
        <div className="flex items-center justify-between gap-3" data-field={name}>
          {head}
          <Switch id={id} checked={value === true} onCheckedChange={(c) => onChange(c)} />
        </div>
      );
    case 'enum':
      return (
        <div className="flex flex-col gap-1.5" data-field={name}>
          {head}
          <Select
            value={typeof value === 'string' ? value : undefined}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue placeholder="…" />
            </SelectTrigger>
            <SelectContent>
              {kind.values.map((v) => (
                <SelectItem key={v} value={v}>
                  {tx(`ui.enums.${v}`, undefined, v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case 'number':
      return (
        <div className="flex flex-col gap-1.5" data-field={name}>
          {head}
          <Input
            id={id}
            type="number"
            autoFocus={autoFocus}
            step={kind.integer ? 1 : 'any'}
            min={kind.min}
            max={kind.max}
            value={typeof value === 'number' ? value : typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </div>
      );
    case 'text':
      return (
        <div className="flex flex-col gap-1.5" data-field={name}>
          {head}
          <VariableInput
            id={id}
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(v) => onChange(v)}
          />
        </div>
      );
    case 'list':
      return (
        <div className="flex flex-col gap-1.5" data-field={name}>
          {head}
          <ListField
            value={
              Array.isArray(value)
                ? value.map(String)
                : typeof value === 'string' && value
                  ? [value]
                  : []
            }
            onChange={onChange}
          />
        </div>
      );
    case 'map':
      return (
        <div className="flex flex-col gap-1.5" data-field={name}>
          {head}
          <MapField
            value={value && typeof value === 'object' ? (value as Record<string, unknown>) : {}}
            onChange={onChange}
          />
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-1.5" data-field={name}>
          {head}
          <JsonField id={id} value={value} onChange={onChange} />
        </div>
      );
  }
}

function ListField({ value, onChange }: { value: string[]; onChange: (v: unknown) => void }) {
  const tx = useTx();
  const rows = value.length ? value : [''];
  const set = (list: string[]) => {
    const clean = list.filter((x) => x !== '');
    onChange(clean.length === 0 ? undefined : clean.length === 1 ? clean[0] : clean);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((v, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional.
        <div key={i} className="flex gap-1.5">
          <VariableInput
            className="flex-1"
            value={v}
            onChange={(x) => set(rows.map((r, j) => (j === i ? x : r)))}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={tx('ui.props.list.remove')}
            onClick={() => set(rows.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...rows, ''])}
      >
        <Plus /> {tx('ui.props.list.add')}
      </Button>
    </div>
  );
}

function MapField({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (v: unknown) => void;
}) {
  const tx = useTx();
  const [rows, setRows] = useState<[string, string][]>(() =>
    Object.entries(value).map(([k, v]) => [k, String(v ?? '')]),
  );
  const commit = (next: [string, string][]) => {
    setRows(next);
    const obj = Object.fromEntries(next.filter(([k]) => k.trim() !== ''));
    onChange(Object.keys(obj).length ? obj : undefined);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(([k, v], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional.
        <div key={i} className="flex gap-1.5">
          <Input
            className="w-2/5"
            value={k}
            placeholder={tx('ui.params.name')}
            onChange={(e) => commit(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))}
          />
          <VariableInput
            className="flex-1"
            value={v}
            onChange={(x) => commit(rows.map((r, j) => (j === i ? [r[0], x] : r)))}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={tx('ui.props.list.remove')}
            onClick={() => commit(rows.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => commit([...rows, ['', '']])}
      >
        <Plus /> {tx('ui.props.list.add')}
      </Button>
    </div>
  );
}

function JsonField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const tx = useTx();
  const [text, setText] = useState(() =>
    value === undefined ? '' : JSON.stringify(value, null, 2),
  );
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(value === undefined ? '' : JSON.stringify(value, null, 2));
  }, [value]);
  return (
    <>
      <Textarea
        id={id}
        className="min-h-24 font-mono text-xs"
        value={text}
        aria-invalid={bad || undefined}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() === '') {
            setBad(false);
            onChange(undefined);
            return;
          }
          try {
            const parsed: unknown = JSON.parse(e.target.value);
            setBad(false);
            onChange(parsed);
          } catch {
            setBad(true);
          }
        }}
      />
      {bad && <p className="text-xs text-destructive">{tx('ui.props.invalidJson')}</p>}
    </>
  );
}

/** Which way a target value is expressed. */
export function targetKind(v: unknown): TargetKind {
  if (!v || typeof v !== 'object') return 'text';
  const o = v as Record<string, unknown>;
  if ('ref' in o) return 'ref';
  if ('strategies' in o) return 'locator';
  for (const k of ['text', 'label', 'placeholder', 'role', 'testId', 'css'] as const)
    if (k in o) return k;
  return 'text';
}

/**
 * Element chooser: saved element, visible text, label, placeholder, type + name; in advanced
 * mode also test id, CSS and the full list of strategies (C-07).
 */
function TargetField({
  id,
  value,
  onChange,
  elements,
}: {
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
  elements: TestCase['elements'];
}) {
  const tx = useTx();
  const advanced = useAdvancedMode();
  const kind = targetKind(value);
  const o = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const refs = Object.entries(elements);
  const label = (k: TargetKind): string => {
    switch (k) {
      case 'ref':
        return tx('ui.props.target.fromLibrary');
      case 'text':
        return tx('ui.props.target.byText');
      case 'label':
        return tx('ui.props.target.byLabel');
      case 'placeholder':
        return tx('ui.props.target.byPlaceholder');
      case 'role':
        return tx('ui.props.target.byRole');
      case 'testId':
        return tx('ui.advanced.byTestId');
      case 'css':
        return tx('ui.props.target.byCss');
      case 'locator':
        return advanced ? tx('ui.advanced.byStrategies') : tx('ui.props.target.fromLibrary');
    }
  };
  const change = (k: TargetKind) => {
    if (k === 'ref') onChange({ ref: refs[0]?.[0] ?? '' });
    else if (k === 'role') onChange({ role: 'button', name: '' });
    else if (k === 'locator') {
      const loc = toLocator(value, elements);
      onChange({ strategies: loc?.strategies ?? [{ kind: 'css', value: '' }] });
    } else onChange({ [k]: '' });
  };
  const ref = typeof o.ref === 'string' ? o.ref : '';
  const saved = kind === 'ref' ? elements[ref] : undefined;
  const editSaved = (strategies: LocatorStrategy[]) => {
    if (!saved) return;
    useEditorStore.getState().apply((d) => ({
      ...d,
      elements: { ...d.elements, [ref]: { ...saved, strategies } },
    }));
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-2">
      <Select value={kind} onValueChange={(v) => change(v as TargetKind)}>
        <SelectTrigger id={id} size="sm" className="w-full" aria-label={tx('ui.props.target.kind')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {targetKindsFor(kind, refs.length > 0, advanced).map((k) => (
            <SelectItem key={k} value={k}>
              {label(k)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {kind === 'ref' && (
        <Select value={ref} onValueChange={(r) => onChange({ ref: r })}>
          <SelectTrigger
            size="sm"
            className="w-full"
            aria-label={tx('ui.props.target.fromLibrary')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {refs.map(([key, el]) => (
              <SelectItem key={key} value={key}>
                {el.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {kind === 'role' && (
        <div className="flex gap-1.5">
          <Select
            value={String(o.role ?? 'button')}
            onValueChange={(role) => onChange({ ...o, role })}
          >
            <SelectTrigger size="sm" className="w-2/5" aria-label={tx('ui.props.target.role')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {tx(`errors.roles.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <VariableInput
            className="flex-1"
            value={String(o.name ?? '')}
            placeholder={tx('ui.props.target.name')}
            label={tx('ui.props.target.name')}
            onChange={(name) => onChange({ ...o, name })}
          />
        </div>
      )}
      {(kind === 'text' ||
        kind === 'label' ||
        kind === 'placeholder' ||
        kind === 'testId' ||
        kind === 'css') && (
        <VariableInput
          className={kind === 'css' || kind === 'testId' ? 'font-mono text-xs' : ''}
          value={String(o[kind] ?? '')}
          label={label(kind)}
          onChange={(v) => onChange({ ...o, [kind]: v })}
        />
      )}
      {kind === 'locator' &&
        (advanced ? (
          <StrategiesEditor
            value={(o.strategies as LocatorStrategy[]) ?? []}
            onChange={(strategies) => onChange({ ...o, strategies })}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {tx('ui.elements.strategies', { count: (o.strategies as unknown[]).length })}
          </p>
        ))}
      {advanced && saved && (
        <StrategiesEditor
          value={saved.strategies}
          onChange={editSaved}
          note={tx('ui.advanced.sharedElement', { name: saved.name })}
        />
      )}
      <PickButtons value={value} onChange={onChange} elements={elements} />
    </div>
  );
}

/** Pick an element on the page / show where the target points [C-06]. */
function PickButtons({
  value,
  onChange,
  elements,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  elements: TestCase['elements'];
}) {
  const tx = useTx();
  const testId = useEditorStore((s) => s.testId);
  const source = usePickSource();
  const [busy, setBusy] = useState<'pick' | 'show' | null>(null);
  const locator = toLocator(value, elements);
  if (!testId && !source) return null;
  const pick = async () => {
    setBusy('pick');
    const hint = toast.info(tx('ui.record.pickHint'));
    try {
      // Loaded on use: keeps the form free of the IPC client (tests, storybook-like use).
      const picked = source
        ? await source.pick()
        : testId
          ? await (await import('../record/record-store')).useRecordStore.getState().pick(testId)
          : null;
      if (picked) {
        onChange(picked);
        toast.success(tx('ui.record.picked'));
      }
    } catch {
      toast.error(tx('ui.record.notFound'));
    } finally {
      toast.dismiss(hint);
      setBusy(null);
    }
  };
  const show = async () => {
    if (!locator) return;
    setBusy('show');
    try {
      const r = source
        ? await source.highlight(locator)
        : testId
          ? await (await import('../record/record-store')).useRecordStore
              .getState()
              .highlight(testId, locator)
          : { count: 0 };
      if (r.count === 1) toast.success(tx('ui.record.found'));
      else if (r.count > 1) toast.warning(tx('ui.record.ambiguous', { count: r.count }));
      else toast.error(tx('ui.record.notFound'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!!busy}
        onClick={() => void pick()}
      >
        {busy === 'pick' ? <Loader2 className="animate-spin" /> : <Crosshair />}
        {tx('ui.record.pick')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!!busy || !locator}
        onClick={() => void show()}
      >
        {busy === 'show' ? <Loader2 className="animate-spin" /> : <ScanEye />}
        {tx('ui.record.highlight')}
      </Button>
    </div>
  );
}

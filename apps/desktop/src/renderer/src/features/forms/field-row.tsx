import {
  ALLOWED_CHARS,
  COMPARE_OPS,
  FIELD_CONDITION_OPS,
  FIELD_TYPES,
  type FieldCondition,
  type FieldSpec,
  type FormSpec,
} from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Checkbox } from '@renderer/components/ui/checkbox';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useTx } from '@renderer/lib/tx';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { fieldKeyFrom, otherFields, toNumber } from './form-edit';

const NONE = '__none__';

function Pick({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      {label}
      {children}
    </div>
  );
}

/** "Field X is …" — used for `visibleWhen` and `requiredWhen`. */
function ConditionEditor({
  label,
  value,
  fields,
  onChange,
}: {
  label: string;
  value: FieldCondition | undefined;
  fields: FieldSpec[];
  onChange: (v: FieldCondition | undefined) => void;
}) {
  const tx = useTx();
  return (
    <Box label={label}>
      <div className="flex gap-2">
        <Pick
          label={label}
          value={value?.field ?? NONE}
          options={[
            { value: NONE, label: tx('ui.forms.never') },
            ...fields.map((f) => ({ value: f.key, label: f.label || f.key })),
          ]}
          onChange={(v) =>
            onChange(v === NONE ? undefined : { field: v, op: value?.op ?? 'filled' })
          }
        />
        {value && (
          <Pick
            label={`${label} — ${tx('ui.forms.condition')}`}
            value={value.op}
            options={FIELD_CONDITION_OPS.map((o) => ({
              value: o,
              label: tx(`ui.forms.ops.${o}`),
            }))}
            onChange={(op) => onChange({ ...value, op: op as FieldCondition['op'] })}
          />
        )}
        {value && (value.op === 'equals' || value.op === 'notEquals') && (
          <Input
            aria-label={tx('ui.forms.conditionValue')}
            value={value.value ?? ''}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
          />
        )}
      </div>
    </Box>
  );
}

/** One field of the form: the common rules in a row, the rest under "more rules". */
export function FieldRow({
  form,
  field,
  onChange,
  onRemove,
}: {
  form: FormSpec;
  field: FieldSpec;
  onChange: (f: FieldSpec) => void;
  onRemove: () => void;
}) {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const set = (p: Partial<FieldSpec>) => onChange({ ...field, ...p });
  const others = otherFields(form, field.key);
  const numeric = field.type === 'number' || field.type === 'money';
  const texty = !numeric && field.type !== 'checkbox' && field.type !== 'file';
  return (
    <div className="rounded-md border p-3" data-testid="field-row">
      <div className="grid items-end gap-2 md:grid-cols-12">
        <div className="md:col-span-3">
          <Box label={tx('ui.forms.label')}>
            <Input
              aria-label={tx('ui.forms.label')}
              value={field.label}
              onChange={(e) =>
                set({
                  label: e.target.value,
                  // A key still left as the placeholder follows the label.
                  ...(/^truong(_\d+)?$/.test(field.key) || field.key === fieldKeyFrom(field.label)
                    ? {
                        key: fieldKeyFrom(
                          e.target.value,
                          otherFields(form, field.key).map((o) => o.key),
                        ),
                      }
                    : {}),
                })
              }
            />
          </Box>
        </div>
        <div className="md:col-span-2">
          <Box label={tx('ui.forms.type')}>
            <Pick
              label={tx('ui.forms.type')}
              value={field.type}
              options={FIELD_TYPES.map((t) => ({ value: t, label: tx(`ui.forms.types.${t}`) }))}
              onChange={(t) => set({ type: t as FieldSpec['type'] })}
            />
          </Box>
        </div>
        <div className="flex items-center gap-2 pb-2 text-xs md:col-span-2">
          <Checkbox
            checked={field.required}
            aria-label={tx('ui.forms.required')}
            onCheckedChange={(v) => set({ required: v === true })}
          />
          {tx('ui.forms.required')}
        </div>
        {texty && (
          <>
            <div className="md:col-span-1">
              <Box label={tx('ui.forms.minLength')}>
                <Input
                  inputMode="numeric"
                  aria-label={tx('ui.forms.minLength')}
                  value={field.minLength ?? ''}
                  onChange={(e) => set({ minLength: toNumber(e.target.value) })}
                />
              </Box>
            </div>
            <div className="md:col-span-1">
              <Box label={tx('ui.forms.maxLength')}>
                <Input
                  inputMode="numeric"
                  aria-label={tx('ui.forms.maxLength')}
                  value={field.maxLength ?? ''}
                  onChange={(e) => set({ maxLength: toNumber(e.target.value) })}
                />
              </Box>
            </div>
          </>
        )}
        {numeric && (
          <>
            <div className="md:col-span-1">
              <Box label={tx('ui.forms.min')}>
                <Input
                  inputMode="decimal"
                  aria-label={tx('ui.forms.min')}
                  value={field.min ?? ''}
                  onChange={(e) => set({ min: toNumber(e.target.value) })}
                />
              </Box>
            </div>
            <div className="md:col-span-1">
              <Box label={tx('ui.forms.max')}>
                <Input
                  inputMode="decimal"
                  aria-label={tx('ui.forms.max')}
                  value={field.max ?? ''}
                  onChange={(e) => set({ max: toNumber(e.target.value) })}
                />
              </Box>
            </div>
          </>
        )}
        <div className="flex justify-end gap-1 md:col-span-3 md:col-start-10">
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? <ChevronDown /> : <ChevronRight />} {tx('ui.forms.moreRules')}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={tx('ui.forms.removeField')}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 border-t pt-3 md:grid-cols-2">
          <Box label={tx('ui.forms.key')}>
            <Input
              aria-label={tx('ui.forms.key')}
              value={field.key}
              onChange={(e) => set({ key: e.target.value })}
            />
          </Box>
          {texty && (
            <>
              <Box label={tx('ui.forms.allowedChars')}>
                <Pick
                  label={tx('ui.forms.allowedChars')}
                  value={field.allowedChars}
                  options={ALLOWED_CHARS.map((c) => ({
                    value: c,
                    label: tx(`ui.forms.chars.${c}`),
                  }))}
                  onChange={(c) => set({ allowedChars: c as FieldSpec['allowedChars'] })}
                />
              </Box>
              <Box label={tx('ui.forms.pattern')}>
                <Input
                  aria-label={tx('ui.forms.pattern')}
                  value={field.pattern ?? ''}
                  placeholder="^[A-Z]{2}[0-9]{6}$"
                  onChange={(e) => set({ pattern: e.target.value })}
                />
              </Box>
            </>
          )}
          <Box label={tx('ui.forms.defaultValue')}>
            <Input
              aria-label={tx('ui.forms.defaultValue')}
              value={field.defaultValue ?? ''}
              onChange={(e) => set({ defaultValue: e.target.value })}
            />
          </Box>
          {field.type === 'dropdown' && (
            <Box label={tx('ui.forms.options')}>
              <Input
                aria-label={tx('ui.forms.options')}
                value={field.options.join(', ')}
                placeholder={tx('ui.forms.optionsHint')}
                onChange={(e) =>
                  set({
                    options: e.target.value
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Box>
          )}
          {field.type === 'file' && (
            <>
              <Box label={tx('ui.forms.fileTypes')}>
                <Input
                  aria-label={tx('ui.forms.fileTypes')}
                  value={(field.file?.extensions ?? []).join(', ')}
                  placeholder={tx('ui.forms.fileTypesHint')}
                  onChange={(e) =>
                    set({
                      file: {
                        ...field.file,
                        extensions: e.target.value
                          .split(',')
                          .map((x) => x.trim().replace(/^\./, ''))
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </Box>
              <Box label={tx('ui.forms.fileSize')}>
                <Input
                  inputMode="numeric"
                  aria-label={tx('ui.forms.fileSize')}
                  value={field.file?.maxSizeKb ?? ''}
                  onChange={(e) => {
                    const maxSizeKb = toNumber(e.target.value);
                    set({
                      file: {
                        extensions: field.file?.extensions ?? [],
                        ...(maxSizeKb === undefined ? {} : { maxSizeKb }),
                      },
                    });
                  }}
                />
              </Box>
            </>
          )}
          <ConditionEditor
            label={tx('ui.forms.visibleWhen')}
            value={field.visibleWhen}
            fields={others}
            onChange={(v) => set({ visibleWhen: v })}
          />
          <ConditionEditor
            label={tx('ui.forms.requiredWhen')}
            value={field.requiredWhen}
            fields={others}
            onChange={(v) => set({ requiredWhen: v })}
          />
          <Box label={tx('ui.forms.compare')}>
            <div className="flex gap-2">
              <Pick
                label={tx('ui.forms.compare')}
                value={field.compare?.field ?? NONE}
                options={[
                  { value: NONE, label: tx('ui.forms.never') },
                  ...others.map((f) => ({ value: f.key, label: f.label || f.key })),
                ]}
                onChange={(v) =>
                  set({
                    compare: v === NONE ? undefined : { field: v, op: field.compare?.op ?? 'eq' },
                  })
                }
              />
              {field.compare && (
                <Pick
                  label={tx('ui.forms.compareOp')}
                  value={field.compare.op}
                  options={COMPARE_OPS.map((o) => ({
                    value: o,
                    label: tx(`ui.forms.compareOps.${o}`),
                  }))}
                  onChange={(op) =>
                    field.compare &&
                    set({ compare: { ...field.compare, op: op as (typeof COMPARE_OPS)[number] } })
                  }
                />
              )}
            </div>
          </Box>
          <div className="flex flex-wrap items-center gap-4 text-xs md:col-span-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={field.unique}
                aria-label={tx('ui.forms.unique')}
                onCheckedChange={(v) => set({ unique: v === true })}
              />
              {tx('ui.forms.unique')}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={field.readOnly}
                aria-label={tx('ui.forms.readOnly')}
                onCheckedChange={(v) => set({ readOnly: v === true })}
              />
              {tx('ui.forms.readOnly')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

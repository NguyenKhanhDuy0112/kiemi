import { type TestCase, TestCaseSchema } from '@kiemi/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { describeTarget, describeValue, sentenceParts } from './describe';
import {
  defaultParams,
  duplicateStep,
  elementUsages,
  flatten,
  insertStep,
  moveStep,
  newStepId,
  nextEnvLimit,
  removeStep,
  savedVariables,
  sessionUsage,
  toggleStep,
  updateStep,
} from './doc-model';
import { useEditorStore } from './editor-store';
import { fieldKind, targetKind } from './schema-form';
import { applySuggestion, openTemplateAt, suggest } from './variable-suggest';

const doc = (): TestCase =>
  TestCaseSchema.parse({
    schemaVersion: 2,
    id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f30',
    name: 'T',
    sessions: ['default', 'quanly'],
    elements: {
      el_luu: { name: 'Nút Lưu', strategies: [{ kind: 'role', role: 'button', name: 'Lưu' }] },
    },
    steps: [
      { id: 's1', action: 'goto', params: { url: '/' } },
      {
        id: 's2',
        action: 'if',
        params: {
          condition: { variable: 'x' },
          steps: [
            {
              id: 's3',
              action: 'click',
              params: { target: { ref: 'el_luu' } },
              session: 'default',
              enabled: true,
              mode: 'hard',
            },
          ],
        },
        session: 'quanly',
      },
      { id: 's4', action: 'extract', params: { target: { text: 'Mã' }, into: 'maDon' } },
    ],
    cleanup: [{ id: 'c1', action: 'api', params: { url: '/x', saveTo: 'resp' } }],
  });

const tx = (key: string, vars?: Record<string, unknown>, fallback?: string) => {
  const dict: Record<string, string> = {
    'errors.roles.button': 'nút',
    'errors.element.role': '{{role}} “{{name}}”',
    'errors.element.label': 'ô “{{value}}”',
    'ui.enums.contains': 'chứa',
    'ui.props.target.none': 'chưa chọn',
  };
  const s = dict[key];
  if (s === undefined) return fallback ?? key;
  return s.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(vars?.[k] ?? ''));
};

describe('doc model [M3-02]', () => {
  it('flattens nested steps with numbers and depth', () => {
    expect(flatten(doc()).map((r) => [r.no, r.step.id, r.depth])).toEqual([
      ['1', 's1', 0],
      ['2', 's2', 0],
      ['2.1', 's3', 1],
      ['3', 's4', 0],
      ['C1', 'c1', 0],
    ]);
  });

  it('inserts after the selected step, also inside containers', () => {
    const step = {
      id: newStepId(doc()),
      action: 'click',
      params: {},
      session: 'default',
      enabled: true,
      mode: 'hard' as const,
    };
    expect(step.id).toBe('s5');
    expect(
      flatten(insertStep(doc(), step, { afterId: 's3' })).map((r) => r.no + r.step.id),
    ).toContain('2.2s5');
    expect(insertStep(doc(), step).steps.at(-1)?.id).toBe('s5');
    expect(
      insertStep(doc(), step, { list: { kind: 'child', parentId: 's2', key: 'elseSteps' } })
        .steps[1]?.params.elseSteps,
    ).toEqual([step]);
  });

  it('removes, toggles, updates and moves without mutating the input', () => {
    const d = doc();
    expect(flatten(removeStep(d, 's3')).map((r) => r.step.id)).toEqual(['s1', 's2', 's4', 'c1']);
    expect(toggleStep(d, 's1').steps[0]?.enabled).toBe(false);
    expect(updateStep(d, 's1', { name: 'Mở', note: undefined }).steps[0]?.name).toBe('Mở');
    expect(moveStep(d, 's4', 0).steps.map((s) => s.id)).toEqual(['s4', 's1', 's2']);
    expect(d.steps.map((s) => s.id)).toEqual(['s1', 's2', 's4']);
  });

  it('duplicates a container with fresh ids for every inner step (J-04)', () => {
    const { doc: d, newId } = duplicateStep(doc(), 's2');
    const ids = flatten(d).map((r) => r.step.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(newId).toBe('s5');
    expect(flatten(d).map((r) => r.no)).toEqual(['1', '2', '2.1', '3', '3.1', '4', 'C1']);
  });

  it('counts sessions, finds element usages and saved variables', () => {
    expect(Object.fromEntries(sessionUsage(doc()))).toEqual({ default: 4, quanly: 1 });
    expect(elementUsages(doc(), 'el_luu')).toEqual(['2.1']);
    expect(savedVariables(doc())).toEqual(['maDon', 'resp']);
  });

  it('builds default params from a JSON Schema', () => {
    expect(
      defaultParams({
        properties: { clear: { type: 'boolean', default: true }, value: { type: 'string' } },
      }),
    ).toEqual({ clear: true });
  });
});

describe('undo / redo [J-06]', () => {
  beforeEach(() => useEditorStore.getState().load('t', doc(), 1));

  it('undoes and redoes edits, and a new edit clears redo', () => {
    const s = () => useEditorStore.getState();
    s().apply((d) => removeStep(d, 's1'));
    s().apply((d) => removeStep(d, 's4'));
    expect(s().doc?.steps.map((x) => x.id)).toEqual(['s2']);
    s().undo();
    expect(s().doc?.steps.map((x) => x.id)).toEqual(['s2', 's4']);
    s().undo();
    expect(s().doc?.steps.map((x) => x.id)).toEqual(['s1', 's2', 's4']);
    s().redo();
    expect(s().doc?.steps.map((x) => x.id)).toEqual(['s2', 's4']);
    s().apply((d) => toggleStep(d, 's2'));
    expect(s().future).toEqual([]);
    expect(s().dirty).toBe(true);
    s().markSaved(2);
    expect(s()).toMatchObject({ dirty: false, version: 2 });
  });
});

describe('step sentences [U-03, U-05]', () => {
  it('splits a template into text and chips', () => {
    expect(
      sentenceParts((v) => `Nhập ${v.target} = ${v.value}`, ['target', 'value']).map(
        ({ key: _k, ...rest }) => rest,
      ),
    ).toEqual([
      { kind: 'text', text: 'Nhập ' },
      { kind: 'chip', param: 'target' },
      { kind: 'text', text: ' = ' },
      { kind: 'chip', param: 'value' },
    ]);
  });

  it('describes targets without technical words', () => {
    const els = doc().elements;
    expect(describeTarget({ ref: 'el_luu' }, els, tx)).toBe('Nút Lưu');
    expect(describeTarget({ role: 'button', name: 'Gửi' }, els, tx)).toBe('nút “Gửi”');
    expect(describeTarget({ label: 'Họ tên' }, els, tx)).toBe('ô “Họ tên”');
    expect(describeTarget({ strategies: [{ kind: 'label', value: 'Email' }] }, els, tx)).toBe(
      'ô “Email”',
    );
    expect(describeTarget(undefined, els, tx)).toBe('chưa chọn');
    expect(describeValue('op', 'contains', tx)).toBe('chứa');
    expect(describeValue('shared', 'id1', tx, new Map([['id1', 'Đăng nhập']]))).toBe('Đăng nhập');
  });
});

describe('form generation [M3-03]', () => {
  it('maps JSON Schema properties to controls', () => {
    expect(fieldKind('target', {}, [])).toEqual({ kind: 'target' });
    expect(fieldKind('steps', { type: 'array' }, ['steps'])).toEqual({ kind: 'nested' });
    expect(fieldKind('condition', { type: 'object' }, ['condition'])).toEqual({ kind: 'json' });
    expect(fieldKind('op', { type: 'string', enum: ['equals', 'contains'] }, [])).toEqual({
      kind: 'enum',
      values: ['equals', 'contains'],
    });
    expect(fieldKind('nth', { anyOf: [{ const: 'first' }, { const: 'last' }] }, [])).toEqual({
      kind: 'enum',
      values: ['first', 'last'],
    });
    expect(
      fieldKind(
        'value',
        { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
        [],
      ),
    ).toEqual({ kind: 'text' });
    expect(
      fieldKind(
        'files',
        { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        [],
      ),
    ).toEqual({ kind: 'list' });
    expect(fieldKind('clear', { type: 'boolean' }, [])).toEqual({ kind: 'boolean' });
    expect(fieldKind('times', { type: 'integer', minimum: 0, maximum: 1000 }, [])).toEqual({
      kind: 'number',
      integer: true,
      min: 0,
      max: 1000,
    });
    expect(
      fieldKind('headers', { type: 'object', additionalProperties: { type: 'string' } }, []),
    ).toEqual({ kind: 'map' });
    expect(fieldKind('body', {}, [])).toEqual({ kind: 'json' });
  });

  it('recognises how a target is written', () => {
    expect(targetKind({ ref: 'x' })).toBe('ref');
    expect(targetKind({ role: 'button', name: 'Lưu' })).toBe('role');
    expect(targetKind({ strategies: [] })).toBe('locator');
    expect(targetKind(undefined)).toBe('text');
  });
});

describe('variable suggestions [E-01, M3-04]', () => {
  const sources = {
    environment: ['portalUrl'],
    test: ['lyDo'],
    data: ['soNgay'],
    secret: ['nvPass'],
    saved: ['maDon'],
  };

  it('detects an open {{ at the caret', () => {
    expect(openTemplateAt('Mã {{ro', 7)).toEqual({ start: 3, query: 'ro' });
    expect(openTemplateAt('Mã {{row.x}} và', 15)).toBeUndefined();
    expect(openTemplateAt('không có', 3)).toBeUndefined();
  });

  it('suggests every scope, filtered without accents', () => {
    expect(
      suggest(sources, '')
        .slice(0, 5)
        .map((s) => s.insert),
    ).toEqual(['maDon', 'lyDo', 'row.soNgay', 'env.portalUrl', 'secret.nvPass']);
    expect(suggest(sources, 'ngay').map((s) => s.insert)).toEqual(['row.soNgay']);
    expect(suggest(sources, 'fake').map((s) => s.insert)).toEqual([
      'fake.name',
      'fake.phone',
      'fake.email',
      'fake.address',
    ]);
    expect(suggest(sources, 'today').map((s) => s.group)).toEqual(['generator', 'generator']);
  });

  it('inserts the chosen variable and places the caret after it', () => {
    expect(applySuggestion('Mã {{ma', 7, 'maDon')).toEqual({ text: 'Mã {{maDon}}', caret: 12 });
    expect(applySuggestion('A {{}} B', 4, 'today')).toEqual({ text: 'A {{today}} B', caret: 11 });
  });
});

describe('nextEnvLimit [O-06]', () => {
  it('switches mode, toggles names and clears on "all"', () => {
    const only = nextEnvLimit(undefined, { mode: 'only' });
    expect(only).toEqual({ only: [] });
    const picked = nextEnvLimit(only, { toggle: 'Staging' });
    expect(picked).toEqual({ only: ['Staging'] });
    expect(nextEnvLimit(picked, { reason: 'x' })).toEqual({ only: ['Staging'], reason: 'x' });
    expect(nextEnvLimit({ only: ['Staging'], reason: 'x' }, { mode: 'except' })).toEqual({
      except: [],
      reason: 'x',
    });
    expect(nextEnvLimit(picked, { toggle: 'Staging' })).toEqual({ only: [] });
    expect(nextEnvLimit(picked, { mode: 'all' })).toBeUndefined();
  });
});

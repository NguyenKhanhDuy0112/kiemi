import { describe, expect, it } from 'vitest';
import { StepCollector } from './collector';
import type { RecordedEvent, RecordedTarget } from './events';

const tab1 = { id: 1, index: 1 };
const tab2 = { id: 2, index: 2 };
const el = (key: string, css = `#${key}`): RecordedTarget => ({
  key,
  locator: { strategies: [{ kind: 'css', value: css }] },
});
const fill = (
  key: string,
  value: string,
  tab = tab1,
): Extract<RecordedEvent, { kind: 'fill' }> => ({
  kind: 'fill',
  target: el(key),
  value,
  tab,
  frame: 1,
});
const click = (key: string, tab = tab1, frame = 1): RecordedEvent => ({
  kind: 'click',
  target: el(key),
  button: 'left',
  modifiers: [],
  tab,
  frame,
});

const entry = (name: string, key = `o-${name}`): RecordedTarget => ({
  key,
  locator: { strategies: [{ kind: 'role', role: 'option', name }] },
});
const pick = (name: string, tab = tab1): RecordedEvent => ({
  kind: 'click',
  target: entry(name),
  button: 'left',
  modifiers: [],
  tab,
  frame: 1,
});

function collect(events: RecordedEvent[], baseUrl?: string) {
  let n = 0;
  const c = new StepCollector({ newId: () => `s${++n}`, ...(baseUrl ? { baseUrl } : {}) });
  const changes = events.flatMap((e) => c.push(e));
  return { steps: c.steps, changes };
}

const brief = (steps: ReturnType<typeof collect>['steps']) =>
  steps.map((s) => `${s.action} ${JSON.stringify({ ...s.params, target: undefined })}`);

describe('StepCollector [K-01, K-02]', () => {
  it('merges keystrokes in one field into a single fill step', () => {
    const { steps, changes } = collect([
      fill('name', 'A'),
      fill('name', 'An'),
      fill('name', 'An '),
      fill('name', 'An B'),
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      id: 's1',
      action: 'fill',
      session: 'default',
      enabled: true,
      params: { value: 'An B', target: { strategies: [{ kind: 'css', value: '#name' }] } },
    });
    expect(changes.map((c) => c.type)).toEqual(['add', 'update', 'update', 'update']);
  });

  it('keeps separate fills for different fields and for the same field typed again later', () => {
    const { steps } = collect([
      fill('a', 'x'),
      fill('b', 'y'),
      click('save'),
      fill('a', 'z'),
      fill('a', 'zz'),
    ]);
    expect(brief(steps)).toEqual([
      'fill {"value":"x"}',
      'fill {"value":"y"}',
      'click {"variant":"single"}',
      'fill {"value":"zz"}',
    ]);
  });

  it('keeps the last choice / tick on the same element', () => {
    const t = (checked: boolean): RecordedEvent => ({
      kind: 'check',
      target: el('urgent'),
      checked,
      tab: tab1,
      frame: 1,
    });
    const s = (option: string): RecordedEvent => ({
      kind: 'select',
      target: el('dept'),
      option,
      tab: tab1,
      frame: 1,
    });
    const { steps } = collect([t(true), t(false), t(true), s('Kế toán'), s('Nhân sự')]);
    expect(brief(steps)).toEqual([
      'check {"checked":true}',
      'select {"by":"label","option":"Nhân sự"}',
    ]);
  });

  it('folds the two clicks of a double-click into one double click', () => {
    const { steps, changes } = collect([
      click('other'),
      click('row'),
      click('row'),
      { kind: 'dblclick', target: el('row'), tab: tab1, frame: 1 },
    ]);
    expect(brief(steps)).toEqual(['click {"variant":"single"}', 'click {"variant":"double"}']);
    expect(changes.map((c) => `${c.type}@${c.index}`)).toEqual([
      'add@0',
      'add@1',
      'add@2',
      'remove@2',
      'remove@1',
      'add@1',
    ]);
  });

  it('records right clicks, modifiers and keys', () => {
    const { steps } = collect([
      { kind: 'click', target: el('a'), button: 'right', modifiers: [], tab: tab1, frame: 1 },
      {
        kind: 'click',
        target: el('b'),
        button: 'left',
        modifiers: ['Control'],
        tab: tab1,
        frame: 1,
      },
      { kind: 'press', keys: 'Enter', target: el('q'), tab: tab1, frame: 1 },
      { kind: 'press', keys: 'Escape', tab: tab1, frame: 1 },
    ]);
    expect(brief(steps)).toEqual([
      'click {"variant":"right"}',
      'click {"variant":"single","modifiers":["Control"]}',
      'press {"keys":"Enter"}',
      'press {"keys":"Escape"}',
    ]);
    expect(steps[2]?.params.target).toEqual(el('q').locator);
    expect(steps[3]?.params).not.toHaveProperty('target');
  });

  it('treats the same element key in another frame or tab as a different element', () => {
    const { steps } = collect([
      fill('x', '1'),
      { ...fill('x', '2'), frame: 2 },
      fill('x', '3', tab2),
    ]);
    expect(brief(steps)).toEqual([
      'fill {"value":"1"}',
      'fill {"value":"2"}',
      'captureTab {"name":"tab-2"}',
      'fill {"value":"3"}',
    ]);
  });

  it('adds a tab switch when actions move to another tab, and none for a new tab', () => {
    const { steps } = collect([
      { kind: 'goto', tab: tab1, url: 'http://app.test/' },
      click('open', tab1),
      click('close', tab2),
      click('back', tab1),
      { kind: 'newTab', tab: { id: 3, index: 2 }, url: 'http://app.test/report' },
      click('print', { id: 3, index: 2 }),
    ]);
    expect(steps.map((s) => s.action)).toEqual([
      'goto',
      'click',
      'captureTab',
      'click',
      'switchTab',
      'click',
      'newTab',
      'click',
    ]);
    expect(steps[2]?.params).toEqual({ name: 'tab-2' });
    expect(steps[4]?.params).toEqual({ by: 'name', value: 'main' });
    expect(steps[6]?.params).toMatchObject({ name: 'tab-3' });
  });

  it('stores URLs under the base URL as relative paths and drops repeated loads', () => {
    const { steps } = collect(
      [
        { kind: 'goto', tab: tab1, url: 'http://app.test/login.html' },
        { kind: 'goto', tab: tab1, url: 'http://app.test/login.html' },
        { kind: 'reload', tab: tab1 },
        { kind: 'goto', tab: tab1, url: 'http://app.test' },
        { kind: 'goto', tab: tab1, url: 'http://app.testing/' },
        { kind: 'goto', tab: tab1, url: 'https://other.test/x' },
      ],
      'http://app.test/',
    );
    expect(brief(steps)).toEqual([
      'goto {"url":"/login.html"}',
      'navigate {"to":"reload"}',
      'goto {"url":"/"}',
      'goto {"url":"http://app.testing/"}',
      'goto {"url":"https://other.test/x"}',
    ]);
  });
});

describe('custom dropdowns become one step [W-04]', () => {
  it('opens + chooses → pickOption', () => {
    const { steps } = collect([click('city'), pick('Đà Nẵng')]);
    expect(steps.map((s) => s.action)).toEqual(['pickOption']);
    expect(steps[0]?.params).toMatchObject({ option: 'Đà Nẵng', target: el('city').locator });
    expect(steps[0]?.params).not.toHaveProperty('search');
  });

  it('opens + types to search + chooses → pickOption with search', () => {
    const { steps, changes } = collect([click('city'), fill('q', 'hà'), pick('Hà Nội')]);
    expect(steps.map((s) => s.action)).toEqual(['pickOption']);
    expect(steps[0]?.params).toMatchObject({
      option: 'Hà Nội',
      search: 'hà',
      target: el('city').locator,
    });
    expect(changes.map((c) => c.type)).toEqual(['add', 'add', 'remove', 'remove', 'add']);
  });

  it('autocomplete: the box is clicked, typed in, then a suggestion is chosen', () => {
    const { steps } = collect([click('who'), fill('who', 'ng'), pick('Nguyễn Văn A')]);
    expect(steps.map((s) => s.action)).toEqual(['pickOption']);
    expect(steps[0]?.params).toMatchObject({ search: 'ng', target: el('who').locator });
  });

  it('keeps a plain click when no list was opened before it', () => {
    const { steps } = collect([pick('Hà Nội')]);
    expect(steps.map((s) => s.action)).toEqual(['click']);
  });
});

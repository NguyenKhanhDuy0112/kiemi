import { DEFAULT_SESSION, type Locator, type Step } from '@kiemi/schema';
import { v7 as uuidv7 } from 'uuid';
import type { RecordedEvent, RecordedTarget } from './events';

/** How the step list changed after one event; `index` is the position in the list. */
export type StepChange =
  | { type: 'add'; index: number; step: Step; password?: boolean }
  | { type: 'update'; index: number; step: Step; password?: boolean }
  | { type: 'remove'; index: number; step: Step };

export interface CollectorOptions {
  /** Session the recorded steps run in [F-01]. Default `"default"`. */
  session?: string;
  /** URLs under this base are stored relative (`/login.html`), so environments can swap it. */
  baseUrl?: string;
  /** Step id generator. Default UUIDv7. */
  newId?: () => string;
}

interface Entry {
  step: Step;
  /** Element identity (`tab:frame:key`) for merging; absent for page-level steps. */
  element?: string;
  /** Inserted after this step (accepted suggestion), to keep their order. */
  after?: string;
}

/**
 * Turns recorded events into steps and merges redundant actions [K-01, K-02]:
 * keystrokes in one field → one "Nhập" step, repeated choices/ticks on the same
 * element → the last one, the two clicks of a double-click → one double click,
 * and a tab switch is added when actions move to another tab.
 */
export class StepCollector {
  private readonly entries: Entry[] = [];
  private readonly session: string;
  private readonly baseUrl: string | undefined;
  private readonly newId: () => string;
  /** Tab the last step ran in. */
  private currentTab: number | undefined;
  /** Name of every tab seen: the first is `main`, then `tab-2`, `tab-3`… [V-01]. */
  private readonly tabNames = new Map<number, string>();
  /** Ids of "Nhập" steps typed into password fields [K-05]. */
  readonly passwords = new Set<string>();

  constructor(options: CollectorOptions = {}) {
    this.session = options.session ?? DEFAULT_SESSION;
    this.baseUrl = options.baseUrl?.replace(/\/+$/, '');
    this.newId = options.newId ?? uuidv7;
  }

  /** Steps recorded so far, in order. */
  get steps(): Step[] {
    return this.entries.map((e) => e.step);
  }

  private nameOf(tab: number): string {
    let name = this.tabNames.get(tab);
    if (name === undefined) {
      name = this.tabNames.size === 0 ? 'main' : `tab-${this.tabNames.size + 1}`;
      this.tabNames.set(tab, name);
    }
    return name;
  }

  push(event: RecordedEvent): StepChange[] {
    const changes: StepChange[] = [];

    if (event.kind === 'newTab') {
      this.currentTab = event.tab.id;
      changes.push(
        this.add('newTab', { url: this.relative(event.url), name: this.nameOf(event.tab.id) }),
      );
      return changes;
    }
    if (this.currentTab !== undefined && this.currentTab !== event.tab.id) {
      const known = this.tabNames.get(event.tab.id);
      // A tab opened by a click is named once, then switched to by name [V-01].
      changes.push(
        known === undefined
          ? this.add('captureTab', { name: this.nameOf(event.tab.id) })
          : this.add('switchTab', { by: 'name', value: known }),
      );
    }
    this.nameOf(event.tab.id);
    this.currentTab = event.tab.id;

    const last = this.entries.at(-1);
    switch (event.kind) {
      case 'goto': {
        const url = this.relative(event.url);
        if (last?.step.action === 'goto' && last.step.params.url === url) break;
        changes.push(this.add('goto', { url }));
        break;
      }
      case 'saveSession':
        changes.push(this.add('saveSession', { name: event.name }));
        break;
      case 'reload':
        changes.push(this.add('navigate', { to: 'reload' }));
        break;
      case 'click': {
        // Opening a custom dropdown, typing to search and choosing an entry = one step [W-04].
        const entry =
          event.button === 'left' && event.modifiers.length === 0 && optionOf(event.target);
        if (entry) {
          const merged = this.mergePick(entry);
          if (merged) {
            changes.push(...merged);
            break;
          }
        }
        const variant = event.button === 'right' ? 'right' : 'single';
        changes.push(
          this.add(
            'click',
            {
              target: targetParam(event.target),
              variant,
              ...(event.modifiers.length ? { modifiers: event.modifiers } : {}),
            },
            elementId(event),
          ),
        );
        break;
      }
      case 'dblclick': {
        const element = elementId(event);
        // The browser reports both clicks before the double-click: fold them in.
        for (let i = 0; i < 2; i++) {
          const prev = this.entries.at(-1);
          if (
            prev?.element !== element ||
            prev.step.action !== 'click' ||
            prev.step.params.variant !== 'single'
          ) {
            break;
          }
          changes.push(this.removeLast());
        }
        changes.push(
          this.add('click', { target: targetParam(event.target), variant: 'double' }, element),
        );
        break;
      }
      case 'fill':
      case 'select':
      case 'check': {
        const element = elementId(event);
        const params =
          event.kind === 'fill'
            ? { target: targetParam(event.target), value: event.value }
            : event.kind === 'select'
              ? { target: targetParam(event.target), by: 'label', option: event.option }
              : { target: targetParam(event.target), checked: event.checked };
        const change =
          last?.element === element && last.step.action === event.kind
            ? this.updateLast(params)
            : this.add(event.kind, params, element);
        // A password typed while recording: offer to keep it as a Secret [K-05].
        if (event.kind === 'fill' && event.secret) {
          this.passwords.add(change.step.id);
          changes.push({ ...change, password: true });
        } else changes.push(change);
        break;
      }
      case 'assert': {
        const t = { target: targetParam(event.target) };
        const [action, params] =
          event.check === 'visible'
            ? ['assertVisible', t]
            : event.check === 'checked'
              ? ['assertState', { ...t, state: 'checked' }]
              : [
                  event.check === 'text' ? 'assertText' : 'assertValue',
                  { ...t, value: event.value ?? '' },
                ];
        changes.push(this.add(action, params));
        break;
      }
      case 'extract':
        changes.push(
          this.add('extract', {
            target: targetParam(event.target),
            from: event.from,
            into: event.into,
          }),
        );
        break;
      case 'press':
        changes.push(
          this.add(
            'press',
            { keys: event.keys, ...(event.target ? { target: targetParam(event.target) } : {}) },
            event.target ? elementId(event) : undefined,
          ),
        );
        break;
    }
    return changes;
  }

  /**
   * `click trigger` [+ `fill search`] + `click entry` → `pickOption` [W-04]. Returns the
   * changes, or `undefined` when nothing before the click opened a list.
   */
  private mergePick(option: string): StepChange[] | undefined {
    const last = this.entries.at(-1);
    const prev = this.entries.at(-2);
    let trigger: Entry | undefined;
    let search: string | undefined;
    let drop = 0;
    if (last?.step.action === 'fill') {
      search = String(last.step.params.value ?? '');
      drop = 1;
      // `click box` + `fill box`: the box itself is the trigger; otherwise the click before it is.
      if (prev?.step.action === 'click' && prev.step.params.variant === 'single') {
        trigger = prev.element === last.element ? last : prev;
        drop = 2;
      } else trigger = last;
    } else if (last?.step.action === 'click' && last.step.params.variant === 'single') {
      trigger = last;
      drop = 1;
    }
    if (!trigger || search === '') return undefined;
    const target = trigger.step.params.target;
    const changes: StepChange[] = [];
    for (let i = 0; i < drop; i++) changes.push(this.removeLast());
    changes.push(
      this.add('pickOption', { target, ...(search ? { search } : {}), option }, trigger.element),
    );
    return changes;
  }

  /** Adds a step right after `afterId` (end of the list if it is gone), e.g. an accepted check [M-01]. */
  insertAfter(afterId: string, action: string, params: Record<string, unknown>): StepChange {
    let at = this.entries.findIndex((e) => e.step.id === afterId);
    if (at < 0) return this.add(action, params);
    while (this.entries[at + 1]?.after === afterId) at++;
    const step: Step = {
      id: this.newId(),
      action,
      params,
      session: this.session,
      enabled: true,
      mode: 'hard',
    };
    this.entries.splice(at + 1, 0, { step, after: afterId });
    return { type: 'add', index: at + 1, step };
  }

  private add(
    action: string,
    params: Record<string, unknown>,
    element?: string,
  ): Extract<StepChange, { type: 'add' }> {
    const step: Step = {
      id: this.newId(),
      action,
      params,
      session: this.session,
      enabled: true,
      mode: 'hard',
    };
    this.entries.push(element ? { step, element } : { step });
    return { type: 'add', index: this.entries.length - 1, step };
  }

  private updateLast(params: Record<string, unknown>): Extract<StepChange, { type: 'update' }> {
    const index = this.entries.length - 1;
    const entry = this.entries[index] as Entry;
    entry.step = { ...entry.step, params };
    return { type: 'update', index, step: entry.step };
  }

  private removeLast(): StepChange {
    const index = this.entries.length - 1;
    const entry = this.entries.pop() as Entry;
    return { type: 'remove', index, step: entry.step };
  }

  private relative(url: string): string {
    const base = this.baseUrl;
    if (!base || !url.startsWith(base)) return url;
    const rest = url.slice(base.length);
    if (rest === '') return '/';
    return /^[/?#]/.test(rest) ? rest : url;
  }
}

function elementId(event: {
  tab: { id: number };
  frame: number;
  target?: RecordedTarget | undefined;
}): string {
  return `${event.tab.id}:${event.frame}:${event.target?.key ?? ''}`;
}

const OPTION_ROLES = new Set(['option', 'menuitem', 'treeitem']);
const OPTION_CLASS =
  /(^|[\s_-])(option|suggestion|dropdown-item|ui-menu-item|select2-results__option)/i;

/** Name of the dropdown entry the target is (an `option`/`menuitem` or a list item styled as one). */
function optionOf(target: RecordedTarget): string | undefined {
  for (const s of target.locator.strategies) {
    if (s.kind === 'role' && OPTION_ROLES.has(s.role) && s.name) return s.name;
  }
  const f = target.locator.fingerprint;
  if (f?.tag === 'li' && f.text && OPTION_CLASS.test(f.attributes.class ?? ''))
    return f.text.trim();
  return undefined;
}

function targetParam(target: RecordedTarget): Locator {
  return target.locator;
}

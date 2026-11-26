import { NOTIFY_KINDS, type NotifyConfig, type NotifyKind } from '@kiemi/schema';

export { NOTIFY_KINDS };

export interface NotifyDraft {
  /** Set when editing a saved channel. */
  id?: string;
  name: string;
  kind: NotifyKind;
  enabled: boolean;
  when: 'always' | 'failed';
  config: NotifyConfig;
  /** What the person typed; empty when editing = keep the stored one. */
  secret: string;
  hasSecret: boolean;
}

export const emptyConfig = (): NotifyConfig => ({
  chatId: '',
  host: '',
  port: 587,
  secure: false,
  username: '',
  from: '',
  to: '',
});

export const newDraft = (kind: NotifyKind = 'slack'): NotifyDraft => ({
  name: '',
  kind,
  enabled: true,
  when: 'failed',
  config: emptyConfig(),
  secret: '',
  hasSecret: false,
});

/** Which fields the form shows for a kind. */
export const fieldsOf = (kind: NotifyKind): ('chatId' | 'smtp')[] =>
  kind === 'telegram' ? ['chatId'] : kind === 'email' ? ['smtp'] : [];

/** Plain reason the draft cannot be saved yet, or `null`. Keys are in `ui.notify.problem.*`. */
export function draftProblem(d: NotifyDraft): string | null {
  if (!d.name.trim()) return 'name';
  if (d.kind !== 'email' && !d.secret && !d.hasSecret) return 'secret';
  if (d.kind === 'telegram' && !d.config.chatId.trim()) return 'chatId';
  if (d.kind === 'email') {
    if (!d.config.host.trim()) return 'host';
    if (!d.config.from.trim() || !d.config.to.trim()) return 'addresses';
  }
  return null;
}

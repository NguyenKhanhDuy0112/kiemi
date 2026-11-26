import {
  checkSecret,
  type NotifyChannelInput,
  NotifyChannelInputSchema,
  type NotifyConfig,
  type NotifyKind,
} from '@kiemi/schema';
import { eq } from 'drizzle-orm';
import { DbError, Repo, type RepoContext, validation } from '../repo';
import { notifyChannels } from '../tables';
import type { SecretCipher } from './environments';

/** A channel as the settings screen sees it: never the secret itself. */
export interface NotifyChannelInfo {
  id: string;
  name: string;
  kind: NotifyKind;
  enabled: boolean;
  when: 'always' | 'failed';
  config: NotifyConfig;
  hasSecret: boolean;
  lastOk: boolean | null;
  lastMessage: string | null;
  lastAt: Date | null;
}

/** A channel with its secret, for sending only (in memory). */
export interface NotifyChannelForSend extends NotifyChannelInfo {
  secret: string;
}

/** Channels that announce run results, with secrets encrypted [X-03, ADR 0021]. */
export class NotifyChannelService {
  readonly repo: Repo<typeof notifyChannels>;
  readonly #cipher: SecretCipher;

  constructor(ctx: RepoContext, cipher: SecretCipher) {
    this.repo = new Repo(ctx, notifyChannels, 'notify channel');
    this.#cipher = cipher;
  }

  #info(r: typeof notifyChannels.$inferSelect): NotifyChannelInfo {
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      enabled: r.enabled,
      when: r.sendWhen,
      config: NotifyChannelInputSchema.shape.config.parse(r.config ?? {}),
      hasSecret: r.ciphertext !== null,
      lastOk: r.lastOk,
      lastMessage: r.lastMessage,
      lastAt: r.lastAt,
    };
  }

  list(projectId: string): NotifyChannelInfo[] {
    return this.repo
      .list(eq(notifyChannels.projectId, projectId), notifyChannels.name)
      .map((r) => this.#info(r));
  }

  /**
   * Creates (no `id`) or updates a channel. `secret`: `undefined` keeps the stored one,
   * a string replaces it (checked for the kind).
   */
  save(
    projectId: string,
    input: NotifyChannelInput,
    secret?: string,
    id?: string,
  ): NotifyChannelInfo {
    const p = NotifyChannelInputSchema.safeParse(input);
    if (!p.success) throw validation('notify channel', p.error.issues);
    let ciphertext: Buffer | undefined;
    if (secret !== undefined && secret !== '') {
      const bad = checkSecret(p.data.kind, secret);
      if (bad) throw new DbError('VALIDATION', bad, { entity: 'notify channel', field: 'secret' });
      if (!this.#cipher.isAvailable())
        throw new DbError('SECRETS_UNAVAILABLE', 'OS encryption is not available', {
          entity: 'notify channel',
        });
      ciphertext = this.#cipher.encrypt(secret);
    }
    const cols = {
      name: p.data.name,
      kind: p.data.kind,
      enabled: p.data.enabled,
      sendWhen: p.data.when,
      config: p.data.config,
      ...(ciphertext ? { ciphertext } : {}),
    };
    const row = id ? this.repo.update(id, cols) : this.repo.create({ projectId, ...cols });
    return this.#info(row);
  }

  remove(id: string): void {
    this.repo.remove(id);
  }

  /** What happened the last time the channel was used. */
  setResult(id: string, ok: boolean, message: string): void {
    this.repo.update(id, { lastOk: ok, lastMessage: message.slice(0, 500), lastAt: new Date() });
  }

  /** Enabled channels of the project with decrypted secrets (unreadable ones are left out). */
  forSend(projectId: string): NotifyChannelForSend[] {
    const out: NotifyChannelForSend[] = [];
    for (const r of this.repo.list(eq(notifyChannels.projectId, projectId))) {
      if (!r.enabled) continue;
      let secret = '';
      if (r.ciphertext) {
        if (!this.#cipher.isAvailable()) continue;
        try {
          secret = this.#cipher.decrypt(r.ciphertext);
        } catch {
          continue; // encrypted on another machine
        }
      }
      out.push({ ...this.#info(r), secret });
    }
    return out;
  }

  /** One channel with its secret, for "send a test" (even when disabled). */
  forTest(id: string): NotifyChannelForSend {
    const r = this.repo.get(id);
    if (!r.ciphertext) return { ...this.#info(r), secret: '' };
    if (!this.#cipher.isAvailable())
      throw new DbError('SECRETS_UNAVAILABLE', 'OS encryption is not available', {
        entity: 'notify channel',
      });
    return { ...this.#info(r), secret: this.#cipher.decrypt(r.ciphertext) };
  }
}

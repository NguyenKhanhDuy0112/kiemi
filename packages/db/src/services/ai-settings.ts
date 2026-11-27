import { type AiSettingsInput, AiSettingsInputSchema } from '@kiemi/schema';
import { eq } from 'drizzle-orm';
import { DbError, Repo, type RepoContext, validation } from '../repo';
import { aiSettings } from '../tables';
import type { SecretCipher } from './environments';

export interface AiUsageTotal {
  month: string;
  tokens: number;
  cost: number;
  calls: number;
}

export interface AiAuditRow {
  at: string;
  action: string;
  allowed: boolean;
  reason?: string;
  note?: string;
}

const AUDIT_KEEP = 200;

/** Settings as the screen sees them: never the key. */
export interface AiSettingsInfo extends AiSettingsInput {
  hasKey: boolean;
  /** Total of the month last used. */
  usage: AiUsageTotal | null;
  lastOk: boolean | null;
  lastMessage: string | null;
  lastAt: Date | null;
}

/** Settings plus the decrypted key, in memory only. */
export interface AiSettingsForUse extends AiSettingsInput {
  apiKey: string;
}

/** AI assistant settings per project; key encrypted like notify secrets [AI-01, ADR 0024]. */
export class AiSettingsService {
  readonly repo: Repo<typeof aiSettings>;
  readonly #cipher: SecretCipher;

  constructor(ctx: RepoContext, cipher: SecretCipher) {
    this.repo = new Repo(ctx, aiSettings, 'ai settings');
    this.#cipher = cipher;
  }

  #row(projectId: string) {
    return this.repo.list(eq(aiSettings.projectId, projectId))[0];
  }

  #input(r: typeof aiSettings.$inferSelect): AiSettingsInput {
    return AiSettingsInputSchema.parse({
      enabled: r.enabled,
      kind: r.kind,
      model: r.model,
      taskModels: r.taskModels ?? {},
      baseUrl: r.baseUrl ?? '',
      localOnly: r.localOnly,
      limitTokens: r.limitTokens,
      priceIn: r.priceIn,
      priceOut: r.priceOut,
    });
  }

  /** `null` when the project never configured AI (it is off). */
  get(projectId: string): AiSettingsInfo | null {
    const r = this.#row(projectId);
    if (!r) return null;
    return {
      ...this.#input(r),
      hasKey: r.ciphertext !== null,
      usage: r.usage ?? null,
      lastOk: r.lastOk,
      lastMessage: r.lastMessage,
      lastAt: r.lastAt,
    };
  }

  /** `apiKey`: `undefined` keeps the stored key, `''` removes it, else replaces it. */
  save(projectId: string, input: AiSettingsInput, apiKey?: string): AiSettingsInfo {
    const p = AiSettingsInputSchema.safeParse(input);
    if (!p.success) throw validation('ai settings', p.error.issues);
    let ciphertext: Buffer | null | undefined;
    if (apiKey === '') ciphertext = null;
    else if (apiKey !== undefined) {
      if (!this.#cipher.isAvailable())
        throw new DbError('SECRETS_UNAVAILABLE', 'OS encryption is not available', {
          entity: 'ai settings',
        });
      ciphertext = this.#cipher.encrypt(apiKey);
    }
    const cols = {
      enabled: p.data.enabled,
      kind: p.data.kind,
      model: p.data.model,
      taskModels: p.data.taskModels,
      baseUrl: p.data.baseUrl || null,
      localOnly: p.data.localOnly,
      limitTokens: p.data.limitTokens,
      priceIn: p.data.priceIn,
      priceOut: p.data.priceOut,
      ...(ciphertext !== undefined ? { ciphertext } : {}),
    };
    const old = this.#row(projectId);
    if (old) this.repo.update(old.id, cols);
    else this.repo.create({ projectId, ...cols });
    return this.get(projectId) as AiSettingsInfo;
  }

  setResult(projectId: string, ok: boolean, message: string): void {
    const r = this.#row(projectId);
    if (r)
      this.repo.update(r.id, {
        lastOk: ok,
        lastMessage: message.slice(0, 500),
        lastAt: new Date(),
      });
  }

  /** Settings with the key for a call; `null` when AI is off for the project. */
  forUse(projectId: string, opts: { even?: boolean } = {}): AiSettingsForUse | null {
    const r = this.#row(projectId);
    if (!r || (!r.enabled && !opts.even)) return null;
    let apiKey = '';
    if (r.ciphertext) {
      if (!this.#cipher.isAvailable())
        throw new DbError('SECRETS_UNAVAILABLE', 'OS encryption is not available', {
          entity: 'ai settings',
        });
      apiKey = this.#cipher.decrypt(r.ciphertext);
    }
    return { ...this.#input(r), apiKey };
  }

  /** Total of `month`; zero when the last saved total is another month. */
  usageOf(projectId: string, month: string): AiUsageTotal {
    const u = this.#row(projectId)?.usage;
    return u && u.month === month ? u : { month, tokens: 0, cost: 0, calls: 0 };
  }

  saveUsage(projectId: string, total: AiUsageTotal): void {
    const r = this.#row(projectId);
    if (r) this.repo.update(r.id, { usage: total });
  }

  /** Newest first; only the last 200 are kept. */
  audit(projectId: string): AiAuditRow[] {
    return [...(this.#row(projectId)?.audit ?? [])].reverse();
  }

  addAudit(projectId: string, row: AiAuditRow): void {
    const r = this.#row(projectId);
    if (r) this.repo.update(r.id, { audit: [...(r.audit ?? []), row].slice(-AUDIT_KEEP) });
  }
}

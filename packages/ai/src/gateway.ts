import { createHash } from 'node:crypto';
import {
  addUsage,
  costOf,
  estimateTokens,
  type Limit,
  type MonthTotal,
  monthOf,
  overLimit,
  type Prices,
} from './cost';
import { isLocal } from './providers';
import { type Redaction, type RedactOptions, redact } from './redact';
import {
  type AiConfig,
  AiError,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  type AiUsage,
} from './types';

/** What really leaves the computer for a request: the redacted copy [AI-02]. */
export interface Outgoing {
  request: AiRequest;
  redactions: Redaction['counts'];
  /** Estimated input tokens. */
  estimatedTokens: number;
}

export interface GatewayAnswer extends AiResponse {
  cached: boolean;
  cost: number | null;
}

/** Where the month total and the cache live (the app keeps them on disk). */
export interface GatewayStore {
  total(month: string): MonthTotal;
  save(total: MonthTotal): void;
  cacheGet(key: string): AiResponse | undefined;
  cachePut(key: string, value: AiResponse): void;
}

export function memoryStore(): GatewayStore {
  const totals = new Map<string, MonthTotal>();
  const cache = new Map<string, AiResponse>();
  return {
    total: (month) => totals.get(month) ?? { month, tokens: 0, cost: 0, calls: 0 },
    save: (t) => void totals.set(t.month, t),
    cacheGet: (k) => cache.get(k),
    cachePut: (k, v) => void cache.set(k, v),
  };
}

export interface GatewayOptions {
  provider: AiProvider;
  config: AiConfig;
  /** Project lock: refuse any provider that is not on this computer [AI-02]. */
  localOnly?: boolean;
  redact?: RedactOptions;
  limit?: Limit;
  prices?: Prices;
  store?: GatewayStore;
  now?: () => Date;
  /** Called after each real call, for the usage log. */
  onUsage?: (u: AiUsage & { model: string; cost: number | null }) => void;
}

export interface Gateway {
  /** The redacted request, as shown by "see what will be sent". */
  preview(req: AiRequest): Outgoing;
  ask(req: AiRequest): Promise<GatewayAnswer>;
}

const keyOf = (r: AiRequest, model: string): string =>
  createHash('sha256')
    .update(JSON.stringify([model, r.system ?? '', r.messages, r.temperature ?? null]))
    .digest('hex');

/**
 * The only door to a model: hides secrets/PII, honours "local only", counts cost against
 * the monthly limit and reuses identical answers [AI-02, AI-04].
 */
export function createGateway(o: GatewayOptions): Gateway {
  const store = o.store ?? memoryStore();
  const now = o.now ?? (() => new Date());

  const preview = (req: AiRequest): Outgoing => {
    const counts = { secret: 0, email: 0, phone: 0, idNumber: 0 };
    const clean = (t: string): string => {
      const r = redact(t, o.redact);
      for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] += r.counts[k];
      return r.text;
    };
    const request: AiRequest = {
      ...req,
      ...(req.system !== undefined ? { system: clean(req.system) } : {}),
      messages: req.messages.map((m) => ({ ...m, content: clean(m.content) })),
    };
    const all = `${request.system ?? ''}${request.messages.map((m) => m.content).join('')}`;
    return { request, redactions: counts, estimatedTokens: estimateTokens(all) };
  };

  return {
    preview,
    async ask(req) {
      if (o.localOnly && !isLocal(o.config))
        throw new AiError('AI_LOCAL_ONLY', 'This project only allows models on this computer');
      const out = preview(req).request;
      const model = o.config.taskModels?.[req.task ?? 'chat'] ?? o.config.model;
      const key = keyOf(out, model);
      const hit = store.cacheGet(key);
      if (hit) return { ...hit, cached: true, cost: 0 };

      const month = monthOf(now());
      if (o.limit && overLimit(store.total(month), o.limit))
        throw new AiError('AI_BUDGET', 'The monthly AI limit is reached');

      const res = await o.provider.complete(out);
      const cost = costOf(res.usage, o.prices);
      store.save(addUsage(store.total(month), res.usage, cost));
      store.cachePut(key, res);
      o.onUsage?.({ ...res.usage, model: res.model, cost });
      return { ...res, cached: false, cost };
    },
  };
}

import type { AiUsage } from './types';

/** Rough size of a text in tokens (about 4 characters each). Only for estimates before a call. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Price in money per million tokens; the project fills it in, nothing is assumed [AI-04]. */
export interface Prices {
  inPerMillion: number;
  outPerMillion: number;
}

export function costOf(usage: AiUsage, prices?: Prices): number | null {
  if (!prices) return null;
  return (
    (usage.inputTokens * prices.inPerMillion + usage.outputTokens * prices.outPerMillion) /
    1_000_000
  );
}

export interface MonthTotal {
  /** `YYYY-MM`. */
  month: string;
  tokens: number;
  cost: number;
  calls: number;
}

export const monthOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export interface Limit {
  tokens?: number;
  cost?: number;
}

/** True when this month already reached a limit — no further call is allowed. */
export function overLimit(total: MonthTotal, limit: Limit): boolean {
  if (limit.tokens !== undefined && total.tokens >= limit.tokens) return true;
  if (limit.cost !== undefined && total.cost >= limit.cost) return true;
  return false;
}

export function addUsage(total: MonthTotal, usage: AiUsage, cost: number | null): MonthTotal {
  return {
    month: total.month,
    tokens: total.tokens + usage.inputTokens + usage.outputTokens,
    cost: total.cost + (cost ?? 0),
    calls: total.calls + 1,
  };
}

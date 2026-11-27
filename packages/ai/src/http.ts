import { AiError, type FetchLike } from './types';

/** Posts JSON, turns every failure into an `AiError` that never carries the key. */
export async function postJson(
  doFetch: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new AiError('AI_NETWORK', `Cannot reach ${new URL(url).host}`);
  }
  const text = await res.text();
  if (!res.ok) {
    const detail = text.slice(0, 300);
    if (res.status === 401 || res.status === 403)
      throw new AiError('AI_AUTH', 'The API key was refused', res.status);
    if (res.status === 429) throw new AiError('AI_RATE_LIMIT', 'Too many requests', res.status);
    throw new AiError('AI_HTTP', `HTTP ${res.status}: ${detail}`, res.status);
  }
  try {
    const json: unknown = JSON.parse(text);
    if (json && typeof json === 'object') return json as Record<string, unknown>;
  } catch {
    /* falls through */
  }
  throw new AiError('AI_BAD_RESPONSE', 'The answer is not JSON');
}

export const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

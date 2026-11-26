import type { Env, TestCase } from '@kiemi/schema';

/** Why a test is not run on this environment [O-06]. */
export interface EnvSkip {
  /** The environment the run targets (its name). */
  environment: string;
  /** The test author's own explanation, if they wrote one. */
  reason?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Checks `testCase.environments.only/except` against the run's environment.
 * An entry matches the environment's id, name or type (case-insensitive), so
 * `except: ["production"]` also covers an environment named "Chính thức" of type production.
 * No environment, or no limit → `null` (the test runs).
 */
export function environmentSkip(
  testCase: Pick<TestCase, 'environments'>,
  env: Pick<Env, 'id' | 'name' | 'type'> | undefined,
): EnvSkip | null {
  const limit = testCase.environments;
  if (!env || !limit) return null;
  const keys = new Set([norm(env.id), norm(env.name), norm(env.type)]);
  const matches = (list: readonly string[]) => list.some((x) => keys.has(norm(x)));
  const excluded = limit.except !== undefined && matches(limit.except);
  const notAllowed = limit.only !== undefined && limit.only.length > 0 && !matches(limit.only);
  if (!excluded && !notAllowed) return null;
  return { environment: env.name, ...(limit.reason ? { reason: limit.reason } : {}) };
}

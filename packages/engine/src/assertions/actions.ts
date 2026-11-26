import { type ActionDefinition, defineAction } from '../define-action';
import { EngineError } from '../errors';
import { stringify } from '../vars/evaluate';
import { CHECKS, type CheckDef, type CheckResult } from './checks';

const POLL_MS = 200;

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new EngineError('RUN_CANCELLED', 'Run was cancelled'));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason ?? new EngineError('RUN_CANCELLED', 'Run was cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const isNotFound = (err: unknown) =>
  err instanceof EngineError &&
  (err.code === 'ELEMENT_NOT_FOUND' || err.code === 'ELEMENT_AMBIGUOUS');

function describeOp(params: Record<string, unknown>): string {
  return typeof params.op === 'string'
    ? params.op
    : typeof params.state === 'string'
      ? params.state
      : 'equals';
}

/** Assertion step: retries the check until it passes or the step time runs out [B-01 → B-11]. */
function assertionFor(check: CheckDef): ActionDefinition {
  const type = `assert${check.name[0]?.toUpperCase()}${check.name.slice(1)}`;
  return defineAction({
    type,
    params: check.params,
    ui: { label: `actions.${type}`, icon: 'circle-check', group: 'assert' },
    async execute(params, ctx) {
      let last: CheckResult | undefined;
      let lastErr: unknown;
      let slowest = 0;
      for (;;) {
        const started = Date.now();
        try {
          last = await check.check(params, ctx);
          lastErr = undefined;
          if (last.pass) return;
          if (last.final) break;
        } catch (err) {
          if (!isNotFound(err)) throw err;
          lastErr = err;
        }
        // Stop while there is still time to report the failure (slow machines: checks take longer).
        slowest = Math.max(slowest, Date.now() - started);
        if (ctx.remainingMs() < POLL_MS + slowest + 150) break;
        await sleep(POLL_MS, ctx.signal);
      }
      if (lastErr) throw lastErr;
      const p = params as Record<string, unknown>;
      throw new EngineError(
        'ASSERTION_FAILED',
        `Step ${ctx.stepNo}: expected ${check.name} ${describeOp(p)} "${stringify(last?.expected)}" but got "${stringify(last?.actual)}"`,
        {
          check: check.name,
          op: describeOp(p),
          expected: stringify(last?.expected),
          actual: stringify(last?.actual),
          ...(last?.details ? { diff: last.details } : {}),
        },
      );
    },
  });
}

export const assertionActions: ActionDefinition[] = CHECKS.map(assertionFor);

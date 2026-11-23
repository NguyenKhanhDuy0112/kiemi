import type { RunError } from '@kiemi/schema';

/**
 * Stable engine error codes. The UI turns `code` + `details` into a localised,
 * plain-language message; `message` is an English fallback for logs.
 */
export const ENGINE_ERROR_CODES = [
  'UNKNOWN_ACTION',
  'INVALID_PARAMS',
  'STEP_TIMEOUT',
  'STEP_FAILED',
  'RUN_CANCELLED',
  'ELEMENT_NOT_FOUND',
  'ELEMENT_AMBIGUOUS',
  'BROWSER_NOT_FOUND',
  'BROWSER_DOWNLOAD_FAILED',
  'BROWSER_LAUNCH_FAILED',
  'UNKNOWN_DEVICE',
  'NO_BROWSER',
  'PROXY_SECRET_MISSING',
  'UNKNOWN_VARIABLE',
  /** `{{app.<key>}}`: the product has no cell in the environment of the run [O-02]. */
  'APP_NOT_AVAILABLE',
  /** `{{app.<key>}}`: no product with this key in the project [O-02]. */
  'UNKNOWN_PRODUCT',
  'INVALID_EXPRESSION',
  'CONSOLE_ERROR',
  'HTTP_ERROR',
  'ASSERTION_FAILED',
  'CONDITION_TIMEOUT',
  'API_ERROR',
  'FILE_NOT_FOUND',
  'TAB_NOT_FOUND',
  'LOGIN_NOT_SAVED',
  'LOGIN_EXPIRED',
  'UNKNOWN_SHARED_STEP',
  /** A step may write data and the environment is protected (Production) [W-10]. */
  'PROTECTED_ENVIRONMENT',
  'ACTION_FAILED',
  'ENGINE_ERROR',
  /** The engine process stopped unexpectedly (raised by the host). */
  'ENGINE_CRASHED',
  /** The environment's SSH tunnel could not be opened (raised by the host). */
  'SSH_FAILED',
] as const;
export type EngineErrorCode = (typeof ENGINE_ERROR_CODES)[number];

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: EngineErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.details = details;
  }
}

/** A nested step failed hard: the parent step fails with the same error. */
export class StepFailure extends Error {
  readonly runError: RunError;
  constructor(runError: RunError) {
    super(runError.message);
    this.name = 'StepFailure';
    this.runError = runError;
  }
}

/** Converts anything thrown by an action into a serialisable `RunError`. */
export function toRunError(err: unknown, fallback: EngineErrorCode = 'STEP_FAILED'): RunError {
  if (err instanceof StepFailure) return err.runError;
  if (err instanceof EngineError) {
    return err.details === undefined
      ? { code: err.code, message: err.message }
      : { code: err.code, message: err.message, details: err.details };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: fallback, message };
}

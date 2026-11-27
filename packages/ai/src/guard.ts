import { AiError } from './types';

/** Things the assistant may ask for; only `read` and `propose` need no approval [AI-21]. */
export type AiAction =
  | { kind: 'read' }
  | { kind: 'propose' }
  | { kind: 'save' }
  | { kind: 'delete' }
  | { kind: 'runBulk' }
  | { kind: 'runStep'; writes: boolean; environmentProtected: boolean };

export interface ActionContext {
  /** The person clicked accept on the diff for exactly this change. */
  approved: boolean;
}

export interface AuditEntry {
  at: string;
  action: AiAction['kind'];
  allowed: boolean;
  reason?: string;
  note?: string;
}

/** Throws unless the assistant may do this; records the decision either way [AI-21]. */
export function guardAction(
  action: AiAction,
  ctx: ActionContext,
  audit?: (e: AuditEntry) => void,
  now: () => Date = () => new Date(),
  note?: string,
): void {
  let reason: string | undefined;
  if (action.kind === 'runBulk') reason = 'AI never runs many tests at once';
  else if (action.kind === 'runStep' && action.writes && action.environmentProtected)
    reason = 'AI cannot run a step that writes on a protected environment';
  else if (
    (action.kind === 'save' || action.kind === 'delete' || action.kind === 'runStep') &&
    !ctx.approved
  )
    reason = 'This change was not approved';
  audit?.({
    at: now().toISOString(),
    action: action.kind,
    allowed: reason === undefined,
    ...(reason ? { reason } : {}),
    ...(note ? { note } : {}),
  });
  if (reason) throw new AiError('AI_BLOCKED', reason);
}

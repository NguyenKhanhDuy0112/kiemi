import {
  type ActionContext,
  type AiAction,
  type AiResponse,
  type AuditEntry,
  createGateway,
  createProvider,
  type Gateway,
  type GatewayStore,
  guardAction,
} from '@kiemi/ai';
import type { Services } from '@kiemi/db';
import { DbError } from '@kiemi/db';

/** Answers kept while the app runs, so asking the same thing twice costs nothing [AI-04]. */
const cache = new Map<string, AiResponse>();

/** Every secret value of the project's environments — to hide them before sending [AI-02]. */
export function projectSecretValues(services: Services, projectId: string): string[] {
  const out: string[] = [];
  for (const e of services.environments.list(projectId)) {
    try {
      out.push(...Object.values(services.environments.forRun(e.id).secrets));
    } catch {
      /* secrets unreadable on this computer: nothing to hide */
    }
  }
  return out;
}

/** The gateway of a project, or throws when AI is off there. */
export function gatewayFor(services: Services, projectId: string): Gateway {
  const s = services.aiSettings.forUse(projectId);
  if (!s) throw new DbError('VALIDATION', 'AI is off for this project', { entity: 'ai settings' });
  const config = {
    kind: s.kind,
    model: s.model,
    taskModels: s.taskModels,
    ...(s.baseUrl ? { baseUrl: s.baseUrl } : {}),
  };
  const store: GatewayStore = {
    total: (month) => services.aiSettings.usageOf(projectId, month),
    save: (t) => services.aiSettings.saveUsage(projectId, t),
    cacheGet: (k) => cache.get(`${projectId}:${k}`),
    cachePut: (k, v) => void cache.set(`${projectId}:${k}`, v),
  };
  return createGateway({
    provider: createProvider(config, { apiKey: s.apiKey }),
    config,
    localOnly: s.localOnly,
    redact: { secrets: projectSecretValues(services, projectId) },
    ...(s.limitTokens ? { limit: { tokens: s.limitTokens } } : {}),
    ...(s.priceIn !== null && s.priceOut !== null
      ? { prices: { inPerMillion: s.priceIn, outPerMillion: s.priceOut } }
      : {}),
    store,
  });
}

/** Checks an action of the assistant and writes the decision to the project's log [AI-21]. */
export function guardAndLog(
  services: Services,
  projectId: string,
  action: AiAction,
  ctx: ActionContext,
  note?: string,
): void {
  guardAction(
    action,
    ctx,
    (e: AuditEntry) => services.aiSettings.addAudit(projectId, e),
    undefined,
    note,
  );
}

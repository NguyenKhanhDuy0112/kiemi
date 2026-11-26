import type { Env, Secrets } from '@kiemi/schema';
import { EngineError } from '../errors';

/** Playwright `newContext({ proxy })` settings. */
export interface ContextProxy {
  server: string;
  bypass?: string;
  username?: string;
  password?: string;
}

/** Playwright `newContext({ httpCredentials })` settings. */
export interface ContextHttpCredentials {
  username: string;
  password: string;
  origin?: string;
}

/** HTTP Basic / NTLM login of an environment, with the password from its secrets [W-01]. */
export function httpAuthFor(
  env: Env | undefined,
  secrets: Secrets = {},
): ContextHttpCredentials | undefined {
  const auth = env?.httpAuth;
  if (!auth) return undefined;
  const password = secrets[auth.passwordSecret];
  if (password === undefined) {
    throw new EngineError(
      'PROXY_SECRET_MISSING',
      `Secret "${auth.passwordSecret}" for the HTTP login is missing`,
      { secret: auth.passwordSecret },
    );
  }
  return {
    username: auth.username,
    password,
    ...(auth.origin ? { origin: auth.origin } : {}),
  };
}

/**
 * Proxy settings of an environment for the browser [G-06]. Chromium sends host
 * names to the proxy (CONNECT for HTTP proxies, domain address type for SOCKS5),
 * so DNS is resolved on the proxy side.
 */
export function proxyFor(env: Env | undefined, secrets: Secrets = {}): ContextProxy | undefined {
  const proxy = env?.proxy;
  if (!proxy) return undefined;
  const out: ContextProxy = { server: proxy.server.replace(/\/$/, '') };
  if (proxy.bypass.length > 0) out.bypass = proxy.bypass.join(',');
  if (proxy.username !== undefined) out.username = proxy.username;
  if (proxy.passwordSecret !== undefined) {
    const password = secrets[proxy.passwordSecret];
    if (password === undefined) {
      throw new EngineError(
        'PROXY_SECRET_MISSING',
        `Secret "${proxy.passwordSecret}" for the proxy is missing`,
        {
          secret: proxy.passwordSecret,
        },
      );
    }
    out.password = password;
  }
  return out;
}

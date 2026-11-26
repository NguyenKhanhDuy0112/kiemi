import type { AppCell, Env, ProxySettings, Secrets, SshSettings } from '@kiemi/schema';
import {
  type Connector,
  direct,
  type LocalSocks,
  startSocksRouter,
  viaHttpConnect,
  viaSocks5,
} from './router';

export interface TunnelLike {
  readonly proxyUrl: string;
  close(): Promise<void>;
}
export type OpenTunnel = (ssh: SshSettings, secrets: Secrets) => Promise<TunnelLike>;

/** How a product's traffic leaves this machine in one environment [O-02, G-06, G-07]. */
export type Route =
  | { kind: 'direct' }
  | { kind: 'ssh'; ssh: SshSettings }
  | { kind: 'proxy'; proxy: ProxySettings };

export function routeOf(cell: AppCell): Route {
  if (cell.ssh?.enabled) return { kind: 'ssh', ssh: cell.ssh };
  if (cell.proxy) return { kind: 'proxy', proxy: cell.proxy };
  return { kind: 'direct' };
}

const hostOf = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
};

const APP_REF = /\{\{[^}]*?\bapp\.([a-z][a-z0-9_]*)/g;

/**
 * Product keys a run may reach: each test's main product first, then every
 * `{{app.<key>…}}` in the tests and shared steps. Only their tunnels are opened.
 */
export function usedProducts(
  env: Env,
  tests: readonly { product?: string | undefined }[],
  extra: readonly unknown[] = [],
): string[] {
  const keys: string[] = [];
  const add = (k: string | undefined) => {
    if (k && Object.hasOwn(env.apps, k) && !keys.includes(k)) keys.push(k);
  };
  for (const t of tests) add(t.product ?? env.defaultProduct ?? Object.keys(env.apps)[0]);
  for (const doc of [...tests, ...extra]) {
    for (const m of JSON.stringify(doc).matchAll(APP_REF)) add(m[1]);
  }
  return keys;
}

interface Group {
  key: string;
  route: Route;
  hosts: Set<string>;
  tunnel?: TunnelLike;
}

export interface PreparedNetwork {
  /** The env with `proxy` set for the browser contexts of the run. */
  env: Env;
  close(): Promise<void>;
}

const bypassed = (host: string, list: readonly string[]) =>
  list.some((b) => {
    const x = b.toLowerCase();
    return x.startsWith('.') ? host.endsWith(x) || host === x.slice(1) : host === x;
  });

function connectorFor(g: Group, secrets: Secrets): Connector {
  if (g.route.kind === 'direct') return direct;
  const server = new URL(
    g.route.kind === 'ssh' ? (g.tunnel as TunnelLike).proxyUrl : g.route.proxy.server,
  );
  const port = Number(server.port) || (server.protocol === 'socks5:' ? 1080 : 80);
  if (server.protocol === 'socks5:') return viaSocks5(server.hostname, port);
  const p = g.route.kind === 'proxy' ? g.route.proxy : undefined;
  const password = p?.passwordSecret ? secrets[p.passwordSecret] : undefined;
  const auth =
    p?.username !== undefined ? { username: p.username, password: password ?? '' } : undefined;
  const via = viaHttpConnect(server.hostname, port, auth);
  const skip = p?.bypass ?? [];
  return (host, prt) => (bypassed(host.toLowerCase(), skip) ? direct(host, prt) : via(host, prt));
}

/**
 * Opens the SSH tunnels of the cells a run uses (one per distinct SSH setting)
 * and sets `env.proxy` [O-02, ADR 0018 §5]:
 * - one network for every product → that proxy/tunnel (direct products bypass it);
 * - several → a local SOCKS router sends each host through its product's route
 *   (unknown hosts follow the main product).
 */
export async function prepareNetwork(opts: {
  env: Env;
  secrets: Secrets;
  used: readonly string[];
  openTunnel?: OpenTunnel | undefined;
}): Promise<PreparedNetwork> {
  const { env, secrets, used } = opts;
  const groups = new Map<string, Group>();
  const order: Group[] = [];
  for (const k of used) {
    const cell = env.apps[k];
    if (!cell || cell.missing) continue;
    const route = routeOf(cell);
    const key = JSON.stringify(route);
    let g = groups.get(key);
    if (!g) {
      g = { key, route, hosts: new Set() };
      groups.set(key, g);
    }
    order.push(g);
    const h = hostOf(cell.url);
    if (h) g.hosts.add(h);
  }
  const networked = [...groups.values()].filter((g) => g.route.kind !== 'direct');
  if (networked.length === 0) return { env: withoutProxy(env), close: async () => undefined };

  const opened: TunnelLike[] = [];
  let router: LocalSocks | undefined;
  const close = async () => {
    await router?.close().catch(() => undefined);
    for (const t of opened.reverse()) await t.close().catch(() => undefined);
  };
  try {
    for (const g of networked) {
      if (g.route.kind !== 'ssh') continue;
      if (!opts.openTunnel) throw new Error('SSH tunnels are not available here');
      g.tunnel = await opts.openTunnel(g.route.ssh, secrets);
      opened.push(g.tunnel);
    }
    const directHosts = [...(groups.get(JSON.stringify({ kind: 'direct' }))?.hosts ?? [])];
    if (networked.length === 1) {
      const g = networked[0] as Group;
      const proxy: ProxySettings =
        g.route.kind === 'ssh'
          ? { server: (g.tunnel as TunnelLike).proxyUrl, bypass: directHosts }
          : {
              ...(g.route as { proxy: ProxySettings }).proxy,
              bypass: [...(g.route as { proxy: ProxySettings }).proxy.bypass, ...directHosts],
            };
      return { env: { ...env, proxy }, close };
    }
    const byHost = new Map<string, Connector>();
    const connectors = new Map<Group, Connector>();
    for (const g of groups.values()) connectors.set(g, connectorFor(g, secrets));
    for (const g of order)
      for (const h of g.hosts) if (!byHost.has(h)) byHost.set(h, connectors.get(g) as Connector);
    const fallback = connectors.get(order[0] as Group) ?? direct;
    router = await startSocksRouter((host) => byHost.get(host.toLowerCase()) ?? fallback);
    return { env: { ...env, proxy: { server: router.proxyUrl, bypass: [] } }, close };
  } catch (err) {
    await close();
    throw err;
  }
}

function withoutProxy(env: Env): Env {
  const { proxy: _p, ssh: _s, ...rest } = env;
  return rest as Env;
}

import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from './api';
import { DemoStore } from './store';

export { handleRequest } from './api';
export { DemoStore } from './store';

/** Chromium flag that makes the demo app host names point at this machine. */
export const DEMO_HOST_RULES = '--host-resolver-rules=MAP *.demo.test 127.0.0.1';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const CONTENT_TYPES: Record<string, string> = { '.css': 'text/css; charset=utf-8' };

/** Serves `public/` (e.g. `/style.css`) like Vite does, so layouts match the real site. */
async function servePublic(
  url: string | undefined,
): Promise<{ body: Buffer; type: string } | undefined> {
  const path = normalize(decodeURIComponent(new URL(url ?? '/', 'http://x').pathname));
  if (path.includes('..')) return undefined;
  try {
    const body = await readFile(join(PUBLIC_DIR, path));
    return { body, type: CONTENT_TYPES[extname(path)] ?? 'application/octet-stream' };
  } catch {
    return undefined;
  }
}

export interface DemoServer {
  /** Base URL, e.g. `http://127.0.0.1:53211`. */
  readonly url: string;
  readonly store: DemoStore;
  close(): Promise<void>;
}

/**
 * Starts the demo API (server-rendered pages such as `/webforms.aspx` and `/api/*`)
 * plus `public/` on a random port, for engine e2e tests that do not need the Vite client pages.
 */
export async function startDemoServer(options: { syncDelayMs?: number } = {}): Promise<DemoServer> {
  const store = new DemoStore({ syncDelayMs: options.syncDelayMs ?? 0 });
  const server: Server = createServer((req, res) => {
    handleRequest(store, req, res)
      .then(async (handled) => {
        if (handled) return;
        const file = await servePublic(req.url);
        if (file) {
          res.setHeader('Content-Type', file.type);
          res.end(file.body);
          return;
        }
        res.statusCode = 404;
        res.end('Not found');
      })
      .catch(() => {
        res.statusCode = 500;
        res.end('Server error');
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    store,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

/** Host names of the two demo "products" served by one site (different domains) [O-01, O-02]. */
export const DEMO_APP_HOSTS = { web: 'web.demo.test', admin: 'admin.demo.test' } as const;

export interface DemoSite {
  /** Base URL of the full site (Vite pages + API), e.g. `http://localhost:53500`. */
  readonly url: string;
  /**
   * The same site as two apps on different domains (own cookies and origin):
   * `web` (employees) and `admin` (managers). The names only resolve inside a browser started
   * with `DEMO_HOST_RULES` (the engine's test browser does).
   */
  readonly apps: { readonly web: string; readonly admin: string };
  close(): Promise<void>;
}

/**
 * Starts the whole demo site (Vite dev server: client pages + API) on a free
 * port, for engine e2e tests that need the JS pages (login, form, requests…).
 */
export async function startDemoSite(options: { syncDelayMs?: number } = {}): Promise<DemoSite> {
  process.env.DEMO_SYNC_DELAY_MS = String(options.syncDelayMs ?? 0);
  const { createServer: createVite } = await import('vite');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const server = await createVite({
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'error',
    server: {
      port: 0,
      strictPort: false,
      host: '127.0.0.1',
      allowedHosts: Object.values(DEMO_APP_HOSTS),
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    apps: {
      web: `http://${DEMO_APP_HOSTS.web}:${port}`,
      admin: `http://${DEMO_APP_HOSTS.admin}:${port}`,
    },
    close: () => server.close(),
  };
}

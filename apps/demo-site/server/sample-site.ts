import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';
import { handleRequest } from './api';
import { DemoDb, tempDbPath } from './db';
import { DemoStore } from './store';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** Maps a request path to a file inside `dir` (never outside it); `/` → `index.html`. */
export function staticFile(dir: string, urlPath: string): string | undefined {
  let path: string;
  try {
    path = decodeURIComponent(new URL(urlPath, 'http://x').pathname);
  } catch {
    return undefined;
  }
  if (path.includes('\0')) return undefined;
  if (path.endsWith('/')) path += 'index.html';
  const root = normalize(dir.endsWith(sep) ? dir : dir + sep);
  const file = normalize(join(root, path));
  return file.startsWith(root) ? file : undefined;
}

export interface SampleSite {
  /** e.g. `http://127.0.0.1:47180`. */
  readonly url: string;
  readonly store: DemoStore;
  /** SQLite file that mirrors the leave requests (tests look into it) [X-05]. */
  readonly dbPath: string;
  close(): Promise<void>;
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as AddressInfo).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

/**
 * The built demo site (`dist/`) + its in-memory API on 127.0.0.1, shipped inside the
 * desktop app so the sample tests run offline [L-01, N-01]. Tries `port` first, then any
 * free port.
 */
export async function startSampleSite(options: {
  dir: string;
  port?: number;
  syncDelayMs?: number;
  /** Where the SQLite file goes; default: a temp folder. */
  dbPath?: string;
}): Promise<SampleSite> {
  const dbPath = options.dbPath ?? tempDbPath();
  const store = new DemoStore({ syncDelayMs: options.syncDelayMs ?? 2000, db: new DemoDb(dbPath) });
  const server = createServer((req, res) => {
    handleRequest(store, req, res)
      .then(async (handled) => {
        if (handled) return;
        const file = staticFile(options.dir, req.url ?? '/');
        const body = file ? await readFile(file).catch(() => undefined) : undefined;
        if (!file || !body) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        res.end(body);
      })
      .catch(() => {
        res.statusCode = 500;
        res.end('Server error');
      });
  });
  let port: number;
  try {
    port = await listen(server, options.port ?? 0);
  } catch {
    port = await listen(server, 0);
  }
  return {
    url: `http://127.0.0.1:${port}`,
    store,
    dbPath,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

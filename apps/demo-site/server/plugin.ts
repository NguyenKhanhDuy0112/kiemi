import type { Connect, Plugin } from 'vite';
import { handleRequest } from './api';
import { DemoDb } from './db';
import { DemoStore } from './store';

/** Mounts the demo API (in-memory) on both `vite` (dev) and `vite preview`. */
export function demoApi(): Plugin {
  const delay = Number(process.env.DEMO_SYNC_DELAY_MS ?? 5000);
  const dbPath = process.env.DEMO_DB_PATH;
  const store = new DemoStore({
    syncDelayMs: Number.isFinite(delay) ? delay : 5000,
    ...(dbPath ? { db: new DemoDb(dbPath) } : {}),
  });

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    handleRequest(store, req, res)
      .then((handled) => {
        if (!handled) next();
      })
      .catch((err: unknown) => next(err));
  };

  return {
    name: 'kiemi-demo-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

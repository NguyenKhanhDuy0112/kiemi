import { createServer, type Server } from 'node:net';
import { type Env, EnvSchema } from '@kiemi/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareNetwork, usedProducts } from './network';
import { type Connector, startSocksRouter, viaSocks5 } from './router';

const ssh = (host: string) => ({
  enabled: true,
  target: { host, port: 22, username: 'qa', auth: 'password' as const, passwordSecret: 'p' },
});

const env = (apps: Record<string, unknown>): Env =>
  EnvSchema.parse({ id: 'e', name: 'UAT', defaultProduct: 'web', apps });

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
});

function fakeTunnels() {
  const log: string[] = [];
  return {
    log,
    open: async (s: { target: { host: string } }) => {
      log.push(`open ${s.target.host}`);
      return {
        proxyUrl: `socks5://127.0.0.1:${1000 + log.length}`,
        close: async () => {
          log.push(`close ${s.target.host}`);
        },
      };
    },
  };
}

describe('usedProducts [O-02]', () => {
  it('main product of each test first, then every {{app.<key>}} reference', () => {
    const e = env({
      web: { name: 'Web', url: 'http://w' },
      admin: { name: 'Admin', url: 'http://a' },
      api: { name: 'API' },
    });
    const tests = [
      { steps: [{ params: { url: '{{app}}/x', b: '{{ app.admin.user }}' } }] },
      { product: 'api', steps: [] },
    ];
    expect(usedProducts(e, tests)).toEqual(['web', 'api', 'admin']);
    expect(usedProducts(e, [{}], [{ steps: ['{{app.nope}}'] }])).toEqual(['web']);
  });
});

describe('prepareNetwork [O-02, G-06, G-07]', () => {
  it('no proxy and no SSH → no proxy for the browser', async () => {
    const net = await prepareNetwork({
      env: env({ web: { name: 'Web', url: 'http://w' } }),
      secrets: {},
      used: ['web'],
    });
    expect(net.env.proxy).toBeUndefined();
  });

  it('one SSH cell → its tunnel; direct products bypass it; closed after', async () => {
    const t = fakeTunnels();
    const net = await prepareNetwork({
      env: env({
        web: { name: 'Web', url: 'http://web.internal', ssh: ssh('bastion') },
        admin: { name: 'Admin', url: 'https://admin.example.com' },
      }),
      secrets: {},
      used: ['web', 'admin'],
      openTunnel: t.open,
    });
    expect(net.env.proxy).toEqual({
      server: 'socks5://127.0.0.1:1001',
      bypass: ['admin.example.com'],
    });
    await net.close();
    expect(t.log).toEqual(['open bastion', 'close bastion']);
  });

  it('cells with the same SSH settings share one tunnel; unused cells open none', async () => {
    const t = fakeTunnels();
    const net = await prepareNetwork({
      env: env({
        web: { name: 'Web', url: 'http://a.internal', ssh: ssh('bastion') },
        admin: { name: 'Admin', url: 'http://b.internal', ssh: ssh('bastion') },
        api: { name: 'API', url: 'http://c.internal', ssh: ssh('other') },
      }),
      secrets: {},
      used: ['web', 'admin'],
      openTunnel: t.open,
    });
    expect(t.log).toEqual(['open bastion']);
    expect(net.env.proxy?.server).toBe('socks5://127.0.0.1:1001');
    await net.close();
  });

  it('a plain proxy keeps its login and bypass list', async () => {
    const net = await prepareNetwork({
      env: env({
        web: {
          name: 'Web',
          url: 'http://w',
          proxy: {
            server: 'http://proxy:3128',
            username: 'u',
            passwordSecret: 'px',
            bypass: ['localhost'],
          },
        },
      }),
      secrets: {},
      used: ['web'],
    });
    expect(net.env.proxy).toEqual({
      server: 'http://proxy:3128',
      username: 'u',
      passwordSecret: 'px',
      bypass: ['localhost'],
    });
  });

  it('two products behind two tunnels → a local router; a failing tunnel closes the others', async () => {
    const t = fakeTunnels();
    const net = await prepareNetwork({
      env: env({
        web: { name: 'Web', url: 'http://web.internal', ssh: ssh('one') },
        admin: { name: 'Admin', url: 'http://admin.internal', ssh: ssh('two') },
      }),
      secrets: {},
      used: ['web', 'admin'],
      openTunnel: t.open,
    });
    expect(t.log).toEqual(['open one', 'open two']);
    expect(net.env.proxy?.server).toMatch(/^socks5:\/\/127\.0\.0\.1:\d+$/);
    expect(net.env.proxy?.server).not.toBe('socks5://127.0.0.1:1001');
    await net.close();
    expect(t.log.slice(2).sort()).toEqual(['close one', 'close two']);

    const failing = fakeTunnels();
    await expect(
      prepareNetwork({
        env: env({
          web: { name: 'Web', url: 'http://w', ssh: ssh('one') },
          admin: { name: 'Admin', url: 'http://a', ssh: ssh('bad') },
        }),
        secrets: {},
        used: ['web', 'admin'],
        openTunnel: async (s) => {
          if (s.target.host === 'bad') throw new Error('auth');
          return failing.open(s);
        },
      }),
    ).rejects.toThrow('auth');
    expect(failing.log).toEqual(['open one', 'close one']);
  });
});

/** A TCP server that answers every connection with its name. */
async function named(name: string): Promise<{ port: number; server: Server }> {
  const server = createServer((s) => s.end(name));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  closers.push(() => new Promise<void>((r) => server.close(() => r())));
  return { port: (server.address() as { port: number }).port, server };
}

describe('SOCKS router', () => {
  it('sends each host through its own connector (unknown → fallback)', async () => {
    const a = await named('A');
    const b = await named('B');
    const to =
      (port: number): Connector =>
      () =>
        viaDirect(port);
    const viaDirect = async (port: number) => {
      const { connect } = await import('node:net');
      return new Promise<import('node:net').Socket>((resolve, reject) => {
        const s = connect({ host: '127.0.0.1', port }, () => resolve(s));
        s.once('error', reject);
      });
    };
    const router = await startSocksRouter((host) =>
      host === 'admin.internal' ? to(b.port) : to(a.port),
    );
    closers.push(() => router.close());
    const read = async (host: string) => {
      const s = await viaSocks5('127.0.0.1', router.port)(host, 80);
      let text = '';
      for await (const chunk of s) text += String(chunk);
      return text;
    };
    expect(await read('web.internal')).toBe('A');
    expect(await read('admin.internal')).toBe('B');
    expect(await read('other.example')).toBe('A');
  });
});

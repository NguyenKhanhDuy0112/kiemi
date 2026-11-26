// @vitest-environment node
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { type AddressInfo, connect as netConnect, type Socket } from 'node:net';
import { type SshSettings, SshSettingsSchema } from '@kiemi/schema';
import { type Connection, Server as SshServer, utils } from 'ssh2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSshTunnel, testSshConnection } from './ssh-tunnel';

/** Host name that only the SSH server can resolve (proves DNS through SSH). */
const INTERNAL = 'kiemi-internal.test';

/**
 * ssh2 sometimes (~0.4 %) writes an ed25519 key it cannot parse back ("Malformed OpenSSH
 * private key"), which made this file fail at random. Keep only keys that round-trip.
 */
function parsableEd25519(): { private: string; public: string } {
  for (;;) {
    const pair = utils.generateKeyPairSync('ed25519');
    if (!(utils.parseKey(pair.private) instanceof Error)) return pair;
  }
}
const hostKey = parsableEd25519().private;
const userKeys = parsableEd25519();
const userPub = utils.parseKey(userKeys.public);

interface FakeSsh {
  port: number;
  forwarded: string[];
  close(): Promise<void>;
}

/** ssh2 test server: password `pw` or the test key; allows direct-tcpip forwarding. */
function startSsh(user: string, hosts: Record<string, string> = {}): Promise<FakeSsh> {
  const forwarded: string[] = [];
  const conns = new Set<Connection>();
  const server = new SshServer({ hostKeys: [hostKey] }, (client) => {
    conns.add(client);
    client.on('error', () => undefined);
    client.on('authentication', (ctx) => {
      if (ctx.username !== user) return ctx.reject();
      if (ctx.method === 'password' && ctx.password === 'pw') return ctx.accept();
      if (ctx.method === 'publickey' && !Array.isArray(userPub) && !(userPub instanceof Error)) {
        const ok = ctx.key.algo === userPub.type && ctx.key.data.equals(userPub.getPublicSSH());
        if (
          ok &&
          (!ctx.signature || userPub.verify(ctx.blob as Buffer, ctx.signature, ctx.hashAlgo))
        )
          return ctx.accept();
      }
      return ctx.reject(['password', 'publickey']);
    });
    client.on('ready', () => {
      client.on('tcpip', (accept, reject, info) => {
        forwarded.push(`${info.destIP}:${info.destPort}`);
        const sock: Socket = netConnect(info.destPort, hosts[info.destIP] ?? info.destIP);
        sock.once('connect', () => {
          const stream = accept();
          stream.on('error', () => sock.destroy());
          sock.pipe(stream).pipe(sock);
        });
        sock.once('error', () => reject());
      });
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: (server.address() as AddressInfo).port,
        forwarded,
        close: () =>
          new Promise<void>((r) => {
            for (const c of conns) c.end();
            server.close(() => r());
          }),
      }),
    ),
  );
}

/** HTTP GET through a SOCKS5 proxy, asking the proxy to resolve `host`. */
function getViaSocks(socksPort: number, host: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = netConnect(socksPort, '127.0.0.1');
    let stage = 0;
    let body = '';
    s.on('error', reject);
    s.on('connect', () => s.write(Buffer.from([5, 1, 0])));
    s.on('data', (d: Buffer) => {
      if (stage === 0) {
        stage = 1;
        const name = Buffer.from(host);
        const p = Buffer.alloc(2);
        p.writeUInt16BE(port);
        s.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, p]));
      } else if (stage === 1) {
        if (d[1] !== 0) return reject(new Error(`socks reply ${d[1]}`));
        stage = 2;
        s.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
      } else body += d.toString();
    });
    s.on('end', () => resolve(body));
  });
}

let web: HttpServer;
let webPort: number;
beforeAll(async () => {
  web = createHttpServer((_req, res) => res.end('xin chào từ mạng nội bộ'));
  await new Promise<void>((r) => web.listen(0, '127.0.0.1', r));
  webPort = (web.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => web.close(() => r())));

const settings = (over: Record<string, unknown>): SshSettings => SshSettingsSchema.parse(over);

describe('SSH tunnel [G-07]', () => {
  it('opens a local SOCKS proxy through SSH with password auth and remote DNS', async () => {
    const ssh = await startSsh('tester', { [INTERNAL]: '127.0.0.1' });
    const tunnel = await openSshTunnel(
      settings({
        target: {
          host: '127.0.0.1',
          port: ssh.port,
          username: 'tester',
          passwordSecret: 'sshPass',
        },
      }),
      { sshPass: 'pw' },
    );
    try {
      expect(tunnel.proxyUrl).toBe(`socks5://127.0.0.1:${tunnel.port}`);
      const res = await getViaSocks(tunnel.port, INTERNAL, webPort);
      expect(res).toContain('xin chào từ mạng nội bộ');
      expect(ssh.forwarded).toContain(`${INTERNAL}:${webPort}`);
    } finally {
      await tunnel.close();
      await ssh.close();
    }
  });

  it('supports private keys and jump hosts', async () => {
    const target = await startSsh('app', { [INTERNAL]: '127.0.0.1' });
    const jump = await startSsh('bastion', { 'target.internal': '127.0.0.1' });
    const tunnel = await openSshTunnel(
      settings({
        target: {
          host: 'target.internal',
          port: target.port,
          username: 'app',
          auth: 'key',
          privateKeySecret: 'appKey',
        },
        jump: {
          host: '127.0.0.1',
          port: jump.port,
          username: 'bastion',
          passwordSecret: 'jumpPass',
        },
      }),
      { appKey: userKeys.private, jumpPass: 'pw' },
    );
    try {
      expect(await getViaSocks(tunnel.port, INTERNAL, webPort)).toContain('mạng nội bộ');
      expect(jump.forwarded).toEqual([`target.internal:${target.port}`]);
    } finally {
      await tunnel.close();
      await target.close();
      await jump.close();
    }
  });

  it('“Test connection” reports success time and clear failure reasons', async () => {
    const ssh = await startSsh('tester');
    const base = { host: '127.0.0.1', port: ssh.port, username: 'tester', passwordSecret: 'p' };
    expect(await testSshConnection(settings({ target: base }), { p: 'pw' })).toMatchObject({
      ok: true,
      ms: expect.any(Number),
    });
    expect(await testSshConnection(settings({ target: base }), { p: 'wrong' })).toMatchObject({
      ok: false,
      reason: 'auth',
    });
    expect(await testSshConnection(settings({ target: base }), {})).toMatchObject({
      ok: false,
      reason: 'missingSecret',
    });
    await ssh.close();
    expect(
      await testSshConnection(
        settings({ target: { ...base, port: 1 } }),
        { p: 'pw' },
        { readyTimeoutMs: 2000 },
      ),
    ).toMatchObject({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('validates SSH settings', () => {
    expect(SshSettingsSchema.safeParse({ target: { host: 'h', username: 'u' } }).success).toBe(
      false,
    ); // password secret missing
    expect(
      SshSettingsSchema.safeParse({ target: { host: 'h', username: 'u', auth: 'key' } }).success,
    ).toBe(false);
    expect(
      SshSettingsSchema.parse({ target: { host: 'h', username: 'u', passwordSecret: 'x' } }).target
        .port,
    ).toBe(22);
  });
});

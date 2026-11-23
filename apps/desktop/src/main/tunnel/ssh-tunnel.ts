import { type AddressInfo, createServer, type Server, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import type { Secrets, SshHop, SshSettings } from '@kiemi/schema';
import { Client, type ConnectConfig } from 'ssh2';

/** Error with a stable code for the UI ("Không kết nối được máy chủ SSH"). */
export class SshError extends Error {
  readonly code = 'SSH_FAILED';
  readonly reason: SshFailure;
  constructor(reason: SshFailure, message: string) {
    super(message);
    this.name = 'SshError';
    this.reason = reason;
  }
}

export type SshFailure = 'auth' | 'timeout' | 'unreachable' | 'missingSecret' | 'other';

export interface SshTunnel {
  /** Local SOCKS5 port. */
  readonly port: number;
  /** `socks5://127.0.0.1:<port>` — use as the run's proxy. */
  readonly proxyUrl: string;
  close(): Promise<void>;
}

export interface TunnelOptions {
  readyTimeoutMs?: number;
}

function secret(secrets: Secrets, name: string | undefined, hop: SshHop): string {
  const value = name === undefined ? undefined : secrets[name];
  if (value === undefined) {
    throw new SshError(
      'missingSecret',
      `Secret "${name ?? '?'}" for SSH ${hop.username}@${hop.host} is missing`,
    );
  }
  return value;
}

function configFor(hop: SshHop, secrets: Secrets, timeout: number): ConnectConfig {
  const base: ConnectConfig = {
    host: hop.host,
    port: hop.port,
    username: hop.username,
    readyTimeout: timeout,
    keepaliveInterval: 15_000,
  };
  if (hop.auth === 'key') {
    return {
      ...base,
      privateKey: secret(secrets, hop.privateKeySecret, hop),
      ...(hop.passphraseSecret ? { passphrase: secret(secrets, hop.passphraseSecret, hop) } : {}),
    };
  }
  return { ...base, password: secret(secrets, hop.passwordSecret, hop), tryKeyboard: false };
}

function classify(err: unknown): SshFailure {
  const e = err as { level?: string; code?: string; message?: string };
  if (e.level === 'client-authentication') return 'auth';
  if (/timed out/i.test(e.message ?? '')) return 'timeout';
  if (
    [
      'ENOTFOUND',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ECONNRESET',
      'EAI_AGAIN',
    ].includes(e.code ?? '')
  )
    return 'unreachable';
  return 'other';
}

function connect(config: ConnectConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const fail = (err: unknown) => {
      client.end();
      reject(
        err instanceof SshError
          ? err
          : new SshError(classify(err), (err as Error)?.message ?? String(err)),
      );
    };
    client.once('ready', () => {
      client.off('error', fail);
      client.on('error', () => undefined); // later errors surface on streams
      resolve(client);
    });
    client.once('error', fail);
    client.connect(config);
  });
}

function forwardOut(client: Client, host: string, port: number): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, host, port, (err, stream) =>
      err ? reject(err) : resolve(stream),
    );
  });
}

/** Connects to the target host, through the jump host if configured [G-07]. */
async function connectChain(
  settings: SshSettings,
  secrets: Secrets,
  timeout: number,
): Promise<Client[]> {
  const target = configFor(settings.target, secrets, timeout);
  if (!settings.jump) return [await connect(target)];
  const jump = await connect(configFor(settings.jump, secrets, timeout));
  try {
    const sock = await forwardOut(jump, settings.target.host, settings.target.port);
    return [jump, await connect({ ...target, sock })];
  } catch (err) {
    jump.end();
    throw err instanceof SshError ? err : new SshError(classify(err), (err as Error).message);
  }
}

/** Minimal SOCKS5 (no auth, CONNECT) whose connections go through SSH (remote DNS). */
function socksOverSsh(client: Client): Server {
  return createServer((sock: Socket) => {
    sock.on('error', () => sock.destroy());
    sock.once('data', (greeting: Buffer) => {
      if (greeting[0] !== 5) {
        sock.destroy();
        return;
      }
      sock.write(Buffer.from([5, 0]));
      sock.once('data', (req: Buffer) => {
        const atyp = req[3];
        let host: string;
        let offset: number;
        if (atyp === 3) {
          const len = req[4] ?? 0;
          host = req.subarray(5, 5 + len).toString('utf8');
          offset = 5 + len;
        } else if (atyp === 1) {
          host = [...req.subarray(4, 8)].join('.');
          offset = 8;
        } else {
          sock.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0])); // address type not supported
          return;
        }
        const port = req.readUInt16BE(offset);
        client.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
          if (err) {
            sock.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0])); // connection refused
            return;
          }
          sock.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          stream.on('error', () => sock.destroy());
          sock.pipe(stream).pipe(sock);
        });
      });
    });
  });
}

/**
 * Opens the environment's SSH tunnel: a local SOCKS5 proxy on 127.0.0.1 whose
 * traffic (and DNS) goes through the SSH server [G-07]. Close it after the run.
 */
export async function openSshTunnel(
  settings: SshSettings,
  secrets: Secrets,
  options: TunnelOptions = {},
): Promise<SshTunnel> {
  const clients = await connectChain(settings, secrets, options.readyTimeoutMs ?? 15_000);
  const last = clients[clients.length - 1] as Client;
  const server = socksOverSsh(last);
  const sockets = new Set<Socket>();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  let closed = false;
  return {
    port,
    proxyUrl: `socks5://127.0.0.1:${port}`,
    close: async () => {
      if (closed) return;
      closed = true;
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      for (const c of [...clients].reverse()) c.end();
    },
  };
}

/** "Kiểm tra kết nối": connect and disconnect, measuring the time [G-07]. */
export async function testSshConnection(
  settings: SshSettings,
  secrets: Secrets,
  options: TunnelOptions = {},
): Promise<{ ok: true; ms: number } | { ok: false; reason: SshFailure; message: string }> {
  const started = Date.now();
  try {
    const clients = await connectChain(settings, secrets, options.readyTimeoutMs ?? 15_000);
    for (const c of clients.reverse()) c.end();
    return { ok: true, ms: Date.now() - started };
  } catch (err) {
    const e = err instanceof SshError ? err : new SshError('other', String(err));
    return { ok: false, reason: e.reason, message: e.message };
  }
}

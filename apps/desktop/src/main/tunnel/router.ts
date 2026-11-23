import { type AddressInfo, createServer, connect as netConnect, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';

/** Opens a raw TCP stream to `host:port` (directly, through SSH, through a proxy…). */
export type Connector = (host: string, port: number) => Promise<Duplex>;

/** Reads from `sock` until `done(buffer)` returns the byte count to consume. */
function readUntil(sock: Duplex, done: (buf: Buffer) => number | undefined): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const n = done(buf);
      if (n === undefined) return;
      cleanup();
      const rest = buf.subarray(n);
      if (rest.length) sock.unshift(rest);
      resolve(buf.subarray(0, n));
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('Proxy closed the connection'));
    };
    const cleanup = () => {
      sock.off('data', onData);
      sock.off('error', onEnd);
      sock.off('close', onEnd);
    };
    sock.on('data', onData);
    sock.once('error', onEnd);
    sock.once('close', onEnd);
  });
}

function tcp(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = netConnect({ host, port }, () => {
      s.off('error', reject);
      resolve(s);
    });
    s.once('error', reject);
  });
}

export const direct: Connector = (host, port) => tcp(host, port);

/** Through a SOCKS5 proxy without auth (e.g. an SSH tunnel's local proxy). Remote DNS. */
export function viaSocks5(proxyHost: string, proxyPort: number): Connector {
  return async (host, port) => {
    const s = await tcp(proxyHost, proxyPort);
    try {
      s.write(Buffer.from([5, 1, 0]));
      const hello = await readUntil(s, (b) => (b.length >= 2 ? 2 : undefined));
      if (hello[1] !== 0) throw new Error('SOCKS5 proxy wants authentication');
      const name = Buffer.from(host, 'utf8');
      const req = Buffer.alloc(7 + name.length);
      req.set([5, 1, 0, 3, name.length]);
      name.copy(req, 5);
      req.writeUInt16BE(port, 5 + name.length);
      s.write(req);
      const reply = await readUntil(s, (b) => {
        if (b.length < 5) return undefined;
        const len = b[3] === 1 ? 4 : b[3] === 4 ? 16 : 1 + (b[4] ?? 0);
        return b.length >= 4 + len + 2 ? 4 + len + 2 : undefined;
      });
      if (reply[1] !== 0) throw new Error(`SOCKS5 proxy refused ${host}:${port}`);
      return s;
    } catch (err) {
      s.destroy();
      throw err;
    }
  };
}

/** Through an HTTP proxy with `CONNECT` (optional basic auth). */
export function viaHttpConnect(
  proxyHost: string,
  proxyPort: number,
  auth?: { username: string; password: string },
): Connector {
  return async (host, port) => {
    const s = await tcp(proxyHost, proxyPort);
    try {
      const target = `${host}:${port}`;
      const header = auth
        ? `Proxy-Authorization: Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}\r\n`
        : '';
      s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${header}\r\n`);
      const head = await readUntil(s, (b) => {
        const i = b.indexOf('\r\n\r\n');
        return i < 0 ? undefined : i + 4;
      });
      if (!/^HTTP\/1\.[01] 200/.test(head.toString('latin1')))
        throw new Error(`HTTP proxy refused ${target}`);
      return s;
    } catch (err) {
      s.destroy();
      throw err;
    }
  };
}

export interface LocalSocks {
  readonly port: number;
  /** `socks5://127.0.0.1:<port>` */
  readonly proxyUrl: string;
  close(): Promise<void>;
}

/**
 * Local SOCKS5 server (no auth, CONNECT) whose connections are opened by
 * `pick(host)` — used to send each product's traffic through its own SSH
 * tunnel / proxy in one browser context [O-02].
 */
export async function startSocksRouter(pick: (host: string) => Connector): Promise<LocalSocks> {
  const sockets = new Set<Socket | Duplex>();
  const server = createServer((sock: Socket) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
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
          sock.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]));
          return;
        }
        const port = req.readUInt16BE(offset);
        pick(host)(host, port).then(
          (up) => {
            sockets.add(up);
            up.on('close', () => sockets.delete(up));
            up.on('error', () => sock.destroy());
            sock.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
            sock.pipe(up).pipe(sock);
          },
          () => sock.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0])),
        );
      });
    });
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
    },
  };
}

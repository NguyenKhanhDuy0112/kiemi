import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DEPARTMENTS,
  payroll,
  payrollPdf,
  payrollXlsx,
  queryPeople,
  readUpload,
  type SortKey,
  sumOf,
  validateImport,
} from './data-pages';
import { type DemoStore, LEAVE_TYPES, type RequestStatus, type User } from './store';
import { handleWebForms } from './webforms';

const COOKIE = 'demo_session';

/** Login of the HTTP Basic area `/secure/basic` [W-01]. */
export const BASIC_AUTH = { user: 'demo', pass: 'demo-pass' } as const;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function readBytes(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function publicUser(u: User) {
  return { username: u.username, fullName: u.fullName, role: u.role };
}

/**
 * Handles `/api/*` and `/webforms.aspx`. Returns false for anything else so Vite serves it.
 */
export async function handleRequest(
  store: DemoStore,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';
  const path = url.pathname;

  if (path === '/webforms.aspx') {
    let form: Record<string, string> | null = null;
    if (method === 'POST') form = Object.fromEntries(new URLSearchParams(await readBody(req)));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(handleWebForms(form));
    return true;
  }

  // HTTP Basic auth area (demo / demo-pass) [W-01].
  if (path === '/secure/basic') {
    const given = /^Basic (.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    const [user, pass] = Buffer.from(given ?? '', 'base64')
      .toString()
      .split(':');
    if (user !== BASIC_AUTH.user || pass !== BASIC_AUTH.pass) {
      res.writeHead(401, {
        'www-authenticate': 'Basic realm="Kiemi demo", charset="UTF-8"',
        'content-type': 'text/plain; charset=utf-8',
      });
      res.end('Cần đăng nhập');
      return true;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>Khu vực nội bộ</title><h1 id="who">Xin chào ${user}</h1><p id="area">Khu vực nội bộ (Basic auth)</p>`,
    );
    return true;
  }

  if (!path.startsWith('/api/')) return false;

  const token = parseCookies(req.headers.cookie)[COOKIE];
  const me = store.userByToken(token);

  // ----- public endpoints -----
  if (path === '/api/login' && method === 'POST') {
    const body = await readJson(req);
    const result = store.login(String(body.username ?? ''), String(body.password ?? ''));
    if (!result) {
      send(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu' });
      return true;
    }
    send(
      res,
      200,
      { user: publicUser(result.user) },
      {
        'set-cookie': `${COOKIE}=${result.token}; Path=/; HttpOnly; SameSite=Lax`,
      },
    );
    return true;
  }
  if (path === '/api/logout' && method === 'POST') {
    if (token) store.logout(token);
    send(res, 200, { ok: true }, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` });
    return true;
  }
  if (path === '/api/reset' && method === 'POST') {
    store.reset();
    send(res, 200, { ok: true });
    return true;
  }
  if (path === '/api/products' && method === 'GET') {
    // Small artificial latency so the table shows a loading state.
    await new Promise((r) => setTimeout(r, 150));
    const q = url.searchParams.get('q');
    send(
      res,
      200,
      store.listProducts({
        page: Number(url.searchParams.get('page') ?? 1),
        pageSize: Number(url.searchParams.get('pageSize') ?? 10),
        ...(q ? { q } : {}),
      }),
    );
    return true;
  }
  if (path === '/api/promo' && method === 'GET') {
    send(res, 200, store.promo);
    return true;
  }
  if (path === '/api/promo' && method === 'POST') {
    if (me?.role !== 'quanly') {
      send(res, 403, { error: 'Chỉ quản lý được sửa giá' });
      return true;
    }
    const body = JSON.parse((await readBody(req)) || '{}') as { price?: unknown };
    const price = Number(body.price);
    if (!Number.isInteger(price) || price <= 0) {
      send(res, 400, { error: 'Giá không hợp lệ' });
      return true;
    }
    store.promo = { ...store.promo, price };
    send(res, 200, store.promo);
    return true;
  }
  if (path === '/api/people' && method === 'GET') {
    const bugs = (url.searchParams.get('bug') ?? '').split(',');
    const sort = url.searchParams.get('sort') as SortKey | null;
    await new Promise((r) => setTimeout(r, 100));
    send(res, 200, {
      ...queryPeople(store.people, {
        q: url.searchParams.get('q') ?? '',
        dept: url.searchParams.get('dept') ?? '',
        ...(sort ? { sort } : {}),
        dir: url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc',
        page: Number(url.searchParams.get('page') ?? 1),
        pageSize: Number(url.searchParams.get('pageSize') ?? 20),
        bugSort: bugs.includes('sort'),
        bugFilter: bugs.includes('filter'),
      }),
      departments: DEPARTMENTS,
    });
    return true;
  }
  if (path === '/api/payroll' && method === 'GET') {
    const rows = payroll();
    send(res, 200, {
      rows,
      totals: {
        base: sumOf(rows, 'base'),
        allowance: sumOf(rows, 'allowance'),
        bonus: sumOf(rows, 'bonus'),
        net: sumOf(rows, 'net'),
      },
    });
    return true;
  }
  if (path === '/api/payroll/export.xlsx' && method === 'GET') {
    res.writeHead(200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="bang-luong-2026-11.xlsx"',
    });
    res.end(Buffer.from(await payrollXlsx(payroll())));
    return true;
  }
  if (path === '/api/payroll/export.pdf' && method === 'GET') {
    res.writeHead(200, {
      'content-type': 'application/pdf',
      'content-disposition': 'attachment; filename="bang-luong-2026-11.pdf"',
    });
    res.end(Buffer.from(payrollPdf(payroll())));
    return true;
  }
  if (path === '/api/import' && method === 'GET') {
    send(res, 200, { imported: store.imported });
    return true;
  }
  if (path === '/api/import' && method === 'POST') {
    const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'file.csv'));
    try {
      const result = validateImport(
        await readUpload(await readBytes(req), name),
        store.imported.map((r) => r.code),
      );
      store.imported.push(...result.imported);
      send(res, 200, {
        total: result.total,
        imported: result.imported.length,
        errors: result.errors,
      });
    } catch {
      send(res, 400, { error: 'Không đọc được file (chỉ nhận .xlsx hoặc .csv)' });
    }
    return true;
  }
  if (path === '/api/meta' && method === 'GET') {
    send(res, 200, { leaveTypes: LEAVE_TYPES, syncDelayMs: store.syncDelayMs });
    return true;
  }

  // ----- authenticated endpoints -----
  if (!me) {
    send(res, 401, { error: 'Bạn chưa đăng nhập' });
    return true;
  }
  if (path === '/api/me' && method === 'GET') {
    send(res, 200, { user: publicUser(me) });
    return true;
  }
  if (path === '/api/requests' && method === 'GET') {
    send(res, 200, { items: store.listRequests(me) });
    return true;
  }
  if (path === '/api/requests' && method === 'POST') {
    if (me.role !== 'nhanvien') {
      send(res, 403, { error: 'Chỉ nhân viên được tạo đơn' });
      return true;
    }
    const result = store.createRequest(me, await readJson(req));
    if (!result.ok) send(res, 422, { errors: result.errors });
    else send(res, 201, { request: result.request });
    return true;
  }
  const action = path.match(/^\/api\/requests\/([^/]+)(?:\/(approve|reject))?$/);
  if (action?.[1]) {
    const id = decodeURIComponent(action[1]);
    if (method === 'DELETE' && !action[2]) {
      const ok = store.deleteRequest(me, id);
      send(res, ok ? 200 : 404, ok ? { ok } : { error: 'Không tìm thấy đơn' });
      return true;
    }
    if (method === 'POST' && action[2]) {
      const status: RequestStatus = action[2] === 'approve' ? 'da-duyet' : 'tu-choi';
      const updated = store.setStatus(me, id, status);
      send(
        res,
        updated ? 200 : 404,
        updated ? { request: updated } : { error: 'Không tìm thấy đơn' },
      );
      return true;
    }
  }

  send(res, 404, { error: 'Không tìm thấy' });
  return true;
}

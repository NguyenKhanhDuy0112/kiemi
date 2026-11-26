import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleRequest } from './api';
import { DemoStore } from './store';

const SYNC_MS = 300;
let server: Server;
let base = '';

beforeAll(async () => {
  const store = new DemoStore({ syncDelayMs: SYNC_MS });
  server = createServer((req, res) => {
    void handleRequest(store, req, res).then((handled) => {
      if (!handled) {
        res.statusCode = 404;
        res.end('not handled');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function login(username: string): Promise<string> {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password: '123456' }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

const call = (path: string, cookie: string, init: RequestInit = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { cookie, ...(init.headers ?? {}) } });

describe('demo API', () => {
  it('rejects wrong credentials and anonymous access', async () => {
    const bad = await fetch(`${base}/api/login`, {
      method: 'POST',
      body: JSON.stringify({ username: 'nhanvien', password: 'x' }),
    });
    expect(bad.status).toBe(401);
    expect((await call('/api/requests', '')).status).toBe(401);
  });

  it('employee creates a request; manager sees it only after the sync delay and approves it', async () => {
    const emp = await login('nhanvien');
    const mgr = await login('quanly');

    const invalid = await call('/api/requests', emp, {
      method: 'POST',
      body: JSON.stringify({ type: 'om' }),
    });
    expect(invalid.status).toBe(422);
    expect(((await invalid.json()) as { errors: object }).errors).toHaveProperty('reason');

    const created = await call('/api/requests', emp, {
      method: 'POST',
      body: JSON.stringify({ type: 'om', fromDate: '2026-11-20', days: 2, reason: 'Đi khám bệnh' }),
    });
    expect(created.status).toBe(201);
    const { request } = (await created.json()) as { request: { id: string; code: string } };
    expect(request.code).toMatch(/^DN-\d{4}$/);

    const listFor = async (cookie: string) =>
      ((await (await call('/api/requests', cookie)).json()) as { items: { code: string }[] }).items;
    expect((await listFor(emp)).map((r) => r.code)).toContain(request.code);
    expect(await listFor(mgr)).toHaveLength(0);

    await new Promise((r) => setTimeout(r, SYNC_MS + 50));
    expect((await listFor(mgr)).map((r) => r.code)).toContain(request.code);

    expect(
      (await call(`/api/requests/${request.id}/approve`, emp, { method: 'POST' })).status,
    ).toBe(404);
    const approved = await call(`/api/requests/${request.id}/approve`, mgr, { method: 'POST' });
    expect(((await approved.json()) as { request: { status: string } }).request.status).toBe(
      'da-duyet',
    );
  });

  it('forbids managers from creating requests', async () => {
    const mgr = await login('quanly');
    const res = await call('/api/requests', mgr, { method: 'POST', body: '{}' });
    expect(res.status).toBe(403);
  });

  it('serves paginated products and the WebForms page', async () => {
    const res = await fetch(`${base}/api/products?page=2&pageSize=20`);
    expect(await res.json()).toMatchObject({ page: 2, pageSize: 20, totalPages: 3 });
    const wf = await fetch(`${base}/webforms.aspx`);
    expect(await wf.text()).toContain('__VIEWSTATE');
  });

  it('serves the staff list, payroll exports and the import endpoint [M12-09]', async () => {
    const people = await (
      await fetch(`${base}/api/people?dept=${encodeURIComponent('Kế toán')}&pageSize=20`)
    ).json();
    expect(people).toMatchObject({ total: 100, totalPages: 5 });
    expect((await (await fetch(`${base}/api/payroll`)).json()).rows).toHaveLength(5);
    const xlsx = await fetch(`${base}/api/payroll/export.xlsx`);
    expect(xlsx.headers.get('content-disposition')).toContain('bang-luong');
    expect((await xlsx.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    const pdf = await fetch(`${base}/api/payroll/export.pdf`);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    const csv = 'Mã,Họ tên,Email,Lương\nA1,An,an@x.vn,1000000\nA2,Bình,sai,1000000\n';
    const res = await fetch(`${base}/api/import`, {
      method: 'POST',
      headers: { 'x-file-name': 'a.csv' },
      body: csv,
    });
    expect(await res.json()).toEqual({
      total: 2,
      imported: 1,
      errors: [{ row: 3, message: 'Email không hợp lệ' }],
    });
    expect((await (await fetch(`${base}/api/import`)).json()).imported).toHaveLength(1);
    await fetch(`${base}/api/reset`, { method: 'POST' });
    expect((await (await fetch(`${base}/api/import`)).json()).imported).toHaveLength(0);
  });

  it('leaves non-API paths to Vite', async () => {
    expect(await (await fetch(`${base}/form.html`)).text()).toBe('not handled');
  });

  it('portal: menu shows only "see" functions, direct URL is 403 only when blocked [Q-09]', async () => {
    const emp = await login('nhanvien');
    const menu = (await (await call('/api/portal/menu', emp)).json()) as { key: string }[];
    expect(menu.map((f) => f.key)).toEqual(['don-nghi', 'kho']);
    expect((await call('/api/portal/fn/don-nghi', emp)).status).toBe(200);
    // hidden: not in the menu, but the address still opens
    expect((await call('/api/portal/fn/bao-cao', emp)).status).toBe(200);
    expect((await call('/api/portal/fn/bang-luong', emp)).status).toBe(403);
    expect((await call('/api/portal/fn/khong-co', emp)).status).toBe(403);
    expect((await call('/api/portal/menu', '')).status).toBe(401);
    await fetch(`${base}/api/portal/leak`, {
      method: 'POST',
      body: JSON.stringify({ role: 'nhanvien', fn: 'bang-luong' }),
    });
    expect((await call('/api/portal/fn/bang-luong', emp)).status).toBe(200);
    await fetch(`${base}/api/reset`, { method: 'POST' });
  });
});

export interface Me {
  username: string;
  fullName: string;
  role: 'nhanvien' | 'quanly';
}

export const ROLE_LABEL: Record<Me['role'], string> = { nhanvien: 'Nhân viên', quanly: 'Quản lý' };

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    credentials: 'same-origin',
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

export function $<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function toast(message: string, kind: 'success' | 'error' = 'success', ms = 4000): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export async function currentUser(): Promise<Me | null> {
  const { status, data } = await api<{ user: Me }>('/api/me');
  return status === 200 ? data.user : null;
}

/** Renders the top bar. Pass `requireRole` to redirect anonymous / wrong-role users to login. */
export async function initPage(opts: { requireLogin?: boolean } = {}): Promise<Me | null> {
  const me = await currentUser();
  if (opts.requireLogin && !me) {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname)}`;
    return null;
  }
  const nav = document.createElement('nav');
  nav.className = 'topbar';
  nav.innerHTML = `
    <a href="/">Kiemi Demo</a>
    <a href="/form.html">Tạo đơn</a>
    <a href="/requests.html">Danh sách đơn</a>
    <a href="/table.html">Sản phẩm</a>
    <a href="/shop.html">Cửa hàng</a>
    <a href="/payroll.html">Bảng lương</a>
    <a href="/list.html">Nhân sự</a>
    <a href="/import.html">Nhập Excel</a>
    <a href="/grid.html">Lưới</a>
    <span class="spacer"></span>
    ${
      me
        ? `<span data-testid="current-user">${escapeHtml(me.fullName)} (${ROLE_LABEL[me.role]})</span>
           <button type="button" class="btn" id="logout">Đăng xuất</button>`
        : '<a href="/login.html">Đăng nhập</a>'
    }`;
  document.body.prepend(nav);
  nav.querySelector('#logout')?.addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    location.href = '/login.html';
  });
  return me;
}

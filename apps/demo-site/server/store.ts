/**
 * In-memory data for the demo site. Shared by every browser session that hits the dev server,
 * which is what lets "user A creates → user B sees it" scenarios work across browser contexts.
 */

import { type ImportRow, type Person, seedPeople } from './data-pages';

/** Promotion shown on `promo.html`. */
export const DEFAULT_PROMO = { price: 99_000, base: 150_000, endsOn: '2030-06-30' };

export type Role = 'nhanvien' | 'quanly';

export interface User {
  username: string;
  password: string;
  fullName: string;
  role: Role;
}

export type LeaveType = 'phep-nam' | 'om' | 'khong-luong';
export type RequestStatus = 'cho-duyet' | 'da-duyet' | 'tu-choi';

export interface LeaveRequest {
  id: string;
  code: string;
  owner: string;
  type: LeaveType;
  fromDate: string; // yyyy-MM-dd
  days: number;
  reason: string;
  urgent: boolean;
  attachment: string | null;
  status: RequestStatus;
  createdAt: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
}

export const USERS: readonly User[] = [
  { username: 'nhanvien', password: '123456', fullName: 'Nguyễn Văn An', role: 'nhanvien' },
  { username: 'nhanvien2', password: '123456', fullName: 'Trần Thị Bình', role: 'nhanvien' },
  { username: 'quanly', password: '123456', fullName: 'Lê Minh Quân', role: 'quanly' },
];

export const LEAVE_TYPES: Record<LeaveType, string> = {
  'phep-nam': 'Nghỉ phép năm',
  om: 'Nghỉ ốm',
  'khong-luong': 'Nghỉ không lương',
};

export interface CreateRequestInput {
  type?: unknown;
  fromDate?: unknown;
  days?: unknown;
  reason?: unknown;
  urgent?: unknown;
  attachment?: unknown;
}

export type FieldErrors = Partial<Record<'type' | 'fromDate' | 'days' | 'reason', string>>;

export interface StoreOptions {
  /** Delay before a new request becomes visible to managers (simulates async sync). */
  syncDelayMs?: number;
  now?: () => number;
}

const CATEGORIES = ['Văn phòng phẩm', 'Điện tử', 'Gia dụng', 'Thực phẩm'];

function seedProducts(): Product[] {
  return Array.from({ length: 47 }, (_, i) => {
    const n = i + 1;
    return {
      id: n,
      sku: `SP${String(n).padStart(3, '0')}`,
      name: `Sản phẩm ${n}`,
      category: CATEGORIES[i % CATEGORIES.length] ?? 'Khác',
      price: 10_000 * ((n * 7) % 23) + 5_000,
      stock: (n * 13) % 50,
    };
  });
}

export class DemoStore {
  readonly syncDelayMs: number;
  private readonly now: () => number;
  private requests: LeaveRequest[] = [];
  private products: Product[] = seedProducts();
  private seq = 0;
  private sessions = new Map<string, string>(); // token -> username

  constructor(opts: StoreOptions = {}) {
    this.syncDelayMs = opts.syncDelayMs ?? 5000;
    this.now = opts.now ?? Date.now;
  }

  /** Rows accepted by the import page [P-09]. */
  imported: ImportRow[] = [];
  readonly people: Person[] = seedPeople();
  /** Summer promotion: price while it runs, normal price after `endsOn` (local date) [Y-01, V-02]. */
  promo = { ...DEFAULT_PROMO };

  reset(): void {
    this.imported = [];
    this.promo = { ...DEFAULT_PROMO };
    this.requests = [];
    this.products = seedProducts();
    this.seq = 0;
    this.sessions.clear();
  }

  // ---------- auth ----------
  login(username: string, password: string): { token: string; user: User } | null {
    const user = USERS.find((u) => u.username === username && u.password === password);
    if (!user) return null;
    const token = crypto.randomUUID();
    this.sessions.set(token, user.username);
    return { token, user };
  }

  logout(token: string): void {
    this.sessions.delete(token);
  }

  userByToken(token: string | undefined): User | null {
    if (!token) return null;
    const username = this.sessions.get(token);
    return USERS.find((u) => u.username === username) ?? null;
  }

  // ---------- leave requests ----------
  validate(input: CreateRequestInput): FieldErrors {
    const errors: FieldErrors = {};
    if (typeof input.type !== 'string' || !(input.type in LEAVE_TYPES)) {
      errors.type = 'Vui lòng chọn loại nghỉ';
    }
    if (typeof input.fromDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.fromDate)) {
      errors.fromDate = 'Vui lòng chọn ngày bắt đầu';
    }
    const days = Number(input.days);
    if (input.days === '' || input.days === undefined || !Number.isInteger(days)) {
      errors.days = 'Số ngày phải là số nguyên';
    } else if (days < 1 || days > 30) {
      errors.days = 'Số ngày phải từ 1 đến 30';
    }
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < 5) errors.reason = 'Lý do tối thiểu 5 ký tự';
    else if (reason.length > 200) errors.reason = 'Lý do tối đa 200 ký tự';
    return errors;
  }

  createRequest(
    owner: User,
    input: CreateRequestInput,
  ): { ok: true; request: LeaveRequest } | { ok: false; errors: FieldErrors } {
    const errors = this.validate(input);
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    this.seq += 1;
    const request: LeaveRequest = {
      id: crypto.randomUUID(),
      code: `DN-${String(this.seq).padStart(4, '0')}`,
      owner: owner.username,
      type: input.type as LeaveType,
      fromDate: input.fromDate as string,
      days: Number(input.days),
      reason: (input.reason as string).trim(),
      urgent: input.urgent === true || input.urgent === 'on',
      attachment:
        typeof input.attachment === 'string' && input.attachment ? input.attachment : null,
      status: 'cho-duyet',
      createdAt: this.now(),
    };
    this.requests.push(request);
    return { ok: true, request };
  }

  /** Employees see their own requests immediately; managers see all after the sync delay. */
  listRequests(viewer: User): LeaveRequest[] {
    const now = this.now();
    return this.requests
      .filter((r) =>
        viewer.role === 'quanly'
          ? now - r.createdAt >= this.syncDelayMs
          : r.owner === viewer.username,
      )
      .sort((a, b) => b.createdAt - a.createdAt || b.code.localeCompare(a.code));
  }

  setStatus(viewer: User, id: string, status: RequestStatus): LeaveRequest | null {
    if (viewer.role !== 'quanly') return null;
    const r = this.listRequests(viewer).find((x) => x.id === id);
    if (!r) return null;
    r.status = status;
    return r;
  }

  deleteRequest(viewer: User, idOrCode: string): boolean {
    const idx = this.requests.findIndex(
      (r) =>
        (r.id === idOrCode || r.code === idOrCode) &&
        (viewer.role === 'quanly' || r.owner === viewer.username),
    );
    if (idx < 0) return false;
    this.requests.splice(idx, 1);
    return true;
  }

  // ---------- products (paginated table) ----------
  listProducts(opts: { page: number; pageSize: number; q?: string }) {
    const q = (opts.q ?? '').trim().toLowerCase();
    const filtered = q
      ? this.products.filter(
          (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
        )
      : this.products;
    const pageSize = Math.min(Math.max(1, Math.floor(opts.pageSize) || 10), 50);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(Math.max(1, Math.floor(opts.page) || 1), totalPages);
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);
    return { items, page, pageSize, total: filtered.length, totalPages };
  }
}

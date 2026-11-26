import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { productKeyFrom } from '@kiemi/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { attachProjectFolder, openProjectFolder, syncProjectFolder } from './folder';
import { createServices, ensureDefaultWorkspace } from './services';
import { createMemoryServices, fakeCipher } from './testing';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'kiemi-prod-'));
  dirs.push(d);
  return d;
};

describe('products [O-01]', () => {
  it('suggests keys from names', () => {
    expect(productKeyFrom('Trang quản trị')).toBe('trang_quan_tri');
    expect(productKeyFrom('Đơn hàng', ['don_hang'])).toBe('don_hang_2');
    expect(productKeyFrom('123 API')).toBe('p_123_api');
  });

  it('v1.0 projects get a "Web" product holding all their tests, folders and elements', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    // v1.0 rows: no product yet.
    const f = s.folders.repo.create({ projectId, parentId: null, name: 'Cũ', sortOrder: 0 });
    s.products.backfillAll();
    const [web] = s.products.list(projectId);
    expect(web).toMatchObject({ key: 'web', name: 'Web' });
    expect(s.folders.repo.get(f.id).productId).toBe(web?.id);
    const t = s.testCases.create({ projectId, folderId: f.id, name: 'A' });
    expect(t.productId).toBe(web?.id);
  });

  it('keeps tests and elements of products apart; folders carry their product', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const web = s.products.list(projectId)[0] as { id: string };
    const admin = s.products.create({ projectId, name: 'Trang quản trị' });
    expect(admin.key).toBe('trang_quan_tri');
    expect(() => s.products.create({ projectId, name: 'X', key: 'web' })).toThrow(
      expect.objectContaining({ code: 'NAME_TAKEN' }),
    );
    const fa = s.folders.create({ projectId, productId: admin.id, name: 'Người dùng' });
    const sub = s.folders.create({ projectId, parentId: fa.id, name: 'Khóa' });
    expect(sub.productId).toBe(admin.id);
    const t = s.testCases.create({ projectId, folderId: sub.id, name: 'Khóa tài khoản' });
    expect(t.productId).toBe(admin.id);
    const loc = { strategies: [{ kind: 'text' as const, value: 'Lưu' }] };
    s.elements.create({ projectId, productId: admin.id, name: 'Nút Lưu', locator: loc });
    s.elements.create({ projectId, name: 'Nút Mua', locator: loc });
    expect(s.elements.list(projectId, admin.id).map((e) => e.name)).toEqual(['Nút Lưu']);
    expect(s.elements.list(projectId, web.id).map((e) => e.name)).toEqual(['Nút Mua']);
    // Moving a folder to another product takes its tests along.
    s.folders.move(fa.id, null, undefined, web.id);
    expect(s.testCases.get(t.id).productId).toBe(web.id);
    // Last product cannot be deleted; others cascade.
    s.products.remove(admin.id);
    expect(() => s.products.remove(web.id)).toThrow(
      expect.objectContaining({ code: 'VALIDATION' }),
    );
  });

  it('lives in the folder as tests/<key>/…; a new top-level directory becomes a product', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const admin = s.products.create({ projectId, name: 'Admin', key: 'admin' });
    s.testCases.create({ projectId, productId: admin.id, name: 'Duyệt' });
    s.testCases.create({ projectId, name: 'Mua hàng' });
    const dir = temp();
    attachProjectFolder(s, projectId, dir);
    expect(readFileSync(join(dir, 'tests', 'admin', 'Duyệt.kiemi.json'), 'utf8')).toContain(
      'Duyệt',
    );
    expect(JSON.parse(readFileSync(join(dir, '.kiemi', 'products.json'), 'utf8')).products).toEqual(
      [
        expect.objectContaining({ key: 'web' }),
        expect.objectContaining({ key: 'admin', name: 'Admin' }),
      ],
    );

    mkdirSync(join(dir, 'tests', 'api', 'Đơn'), { recursive: true });
    writeFileSync(
      join(dir, 'tests', 'api', 'Đơn', 'x.kiemi.json'),
      JSON.stringify({
        schemaVersion: 2,
        id: '01890000-0000-7000-8000-0000000000c1',
        name: 'Tạo đơn',
      }),
    );
    syncProjectFolder(s, projectId);
    const api = s.products.list(projectId).find((p) => p.key === 'api');
    expect(api).toBeDefined();
    const t = s.testCases.get('01890000-0000-7000-8000-0000000000c1');
    expect(t.productId).toBe(api?.id);
    expect(s.folders.repo.get(t.folderId as string)).toMatchObject({
      name: 'Đơn',
      productId: api?.id,
    });

    // Another machine sees the same products and ids.
    const db = openDatabase({ path: ':memory:' });
    const seed = ensureDefaultWorkspace(db);
    const other = createServices({ db, workspaceId: seed.workspaceId }, fakeCipher());
    openProjectFolder(other, dir);
    expect(other.products.list(projectId).map((p) => p.key)).toEqual(['web', 'admin', 'api']);
    expect(other.testCases.get(t.id).productId).toBe(api?.id);
  });

  it('a test runs with its product as {{app}} unless the file names one [O-02]', () => {
    const { services: s, defaultProjectId: projectId } = createMemoryServices();
    const admin = s.products.create({ projectId, name: 'Admin' });
    const t = s.testCases.create({ projectId, productId: admin.id, name: 'Duyệt' });
    expect(s.testCases.forRun(t.id).product).toBe('admin');
    s.testCases.save(t.id, { ...t.content, product: 'web' });
    expect(s.testCases.forRun(t.id).product).toBe('web');
  });
});

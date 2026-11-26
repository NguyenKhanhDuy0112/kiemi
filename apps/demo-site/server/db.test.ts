import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { DemoDb, tempDbPath } from './db';
import { DemoStore, USERS } from './store';

const user = (name: string) => {
  const u = USERS.find((x) => x.username === name);
  if (!u) throw new Error(name);
  return u;
};

describe('demo database mirror [X-05]', () => {
  it('keeps the table equal to the requests the site shows', () => {
    const path = tempDbPath();
    const store = new DemoStore({ syncDelayMs: 0, db: new DemoDb(path) });
    const read = () => {
      const db = new Database(path, { readonly: true });
      try {
        return db.prepare('SELECT code, owner, status FROM leave_requests ORDER BY code').all();
      } finally {
        db.close();
      }
    };
    expect(read()).toEqual([]);
    const made = store.createRequest(user('nhanvien'), {
      type: 'om',
      fromDate: '2030-01-02',
      days: 2,
      reason: 'Đi khám bệnh',
    });
    if (!made.ok) throw new Error('not created');
    expect(read()).toEqual([{ code: made.request.code, owner: 'nhanvien', status: 'cho-duyet' }]);
    store.setStatus(user('quanly'), made.request.id, 'da-duyet');
    expect(read()).toEqual([{ code: made.request.code, owner: 'nhanvien', status: 'da-duyet' }]);
    store.reset();
    expect(read()).toEqual([]);
  });
});

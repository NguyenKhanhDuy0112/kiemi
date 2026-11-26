import { accessOf } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import {
  addFunction,
  addRole,
  newMatrix,
  removeFunction,
  removeRole,
  rolesWithoutLogin,
  setCell,
  uniqueKey,
} from './matrix-edit';

describe('permission matrix editing [Q-09]', () => {
  it('makes unique ASCII keys', () => {
    expect(uniqueKey('Kế toán', [])).toBe('ke-toan');
    expect(uniqueKey('Kế toán', ['ke-toan'])).toBe('ke-toan-2');
    expect(uniqueKey('???', [])).toBe('muc');
  });
  it('sets cells, defaults missing ones to hidden, and cleans cells with the role / function', () => {
    let m = addFunction(
      addRole(addRole(newMatrix('P'), 'Quản lý'), 'Kế toán'),
      'Bảng lương',
      '/luong',
    );
    expect(accessOf(m, 'quan-ly', 'bang-luong')).toBe('hidden');
    m = setCell(setCell(m, 'quan-ly', 'bang-luong', 'see'), 'ke-toan', 'bang-luong', 'blocked');
    expect(accessOf(m, 'ke-toan', 'bang-luong')).toBe('blocked');
    expect(Object.keys(removeRole(m, 'quan-ly').cells)).toEqual(['ke-toan|bang-luong']);
    expect(removeFunction(m, 'bang-luong').cells).toEqual({});
  });
  it('lists roles that cannot sign in yet', () => {
    const m = addRole(newMatrix('P'), 'Quản lý');
    expect(rolesWithoutLogin(m)).toEqual(['Quản lý']);
    const withLogin = { ...m, roles: m.roles.map((r) => ({ ...r, username: 'ql' })) };
    expect(rolesWithoutLogin(withLogin)).toEqual([]);
  });
});

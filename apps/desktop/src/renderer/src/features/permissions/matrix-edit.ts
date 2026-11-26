import {
  cellKey,
  type PermAccess,
  type PermissionMatrix,
  PermissionMatrixSchema,
  type PermRole,
} from '@kiemi/schema';

export const ACCESS_ORDER: PermAccess[] = ['see', 'hidden', 'blocked'];

export const newMatrix = (name: string): PermissionMatrix =>
  PermissionMatrixSchema.parse({ id: crypto.randomUUID(), name });

/** Unique key from a title: "Kế toán" → "ke-toan", then "ke-toan-2"... */
export function uniqueKey(title: string, taken: string[]): string {
  const base =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'muc';
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`;
  return key;
}

export function addRole(m: PermissionMatrix, name: string): PermissionMatrix {
  const role: PermRole = {
    key: uniqueKey(
      name,
      m.roles.map((r) => r.key),
    ),
    name,
    username: '',
    password: '',
  };
  return { ...m, roles: [...m.roles, role] };
}

export function addFunction(m: PermissionMatrix, name: string, path: string): PermissionMatrix {
  const key = uniqueKey(
    name,
    m.functions.map((f) => f.key),
  );
  return { ...m, functions: [...m.functions, { key, name, path }] };
}

export function removeRole(m: PermissionMatrix, roleKey: string): PermissionMatrix {
  return {
    ...m,
    roles: m.roles.filter((r) => r.key !== roleKey),
    cells: Object.fromEntries(
      Object.entries(m.cells).filter(([k]) => !k.startsWith(`${roleKey}|`)),
    ),
  };
}

export function removeFunction(m: PermissionMatrix, fnKey: string): PermissionMatrix {
  return {
    ...m,
    functions: m.functions.filter((f) => f.key !== fnKey),
    cells: Object.fromEntries(Object.entries(m.cells).filter(([k]) => !k.endsWith(`|${fnKey}`))),
  };
}

export const setCell = (
  m: PermissionMatrix,
  roleKey: string,
  fnKey: string,
  access: PermAccess,
): PermissionMatrix => ({ ...m, cells: { ...m.cells, [cellKey(roleKey, fnKey)]: access } });

/** Roles whose login is not filled in yet (the generated test could not sign in). */
export const rolesWithoutLogin = (m: PermissionMatrix): string[] =>
  m.roles.filter((r) => !r.username.trim()).map((r) => r.name);

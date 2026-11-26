import { z } from 'zod';
import type { Locator } from './locator';
import type { StepInput } from './step';

/**
 * What a role sees for a function [Q-09]:
 * `see` = menu item shown and the page opens; `hidden` = no menu item (typing the address is not
 * checked); `blocked` = no menu item and typing the address shows "no permission".
 */
export const PermAccessSchema = z.enum(['see', 'hidden', 'blocked']);
export type PermAccess = z.infer<typeof PermAccessSchema>;

export const PermRoleSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  username: z.string().default(''),
  /** Plain text or a variable such as `{{matkhau_quanly}}` (kept out of the file). */
  password: z.string().default(''),
});
export type PermRole = z.infer<typeof PermRoleSchema>;

export const PermFunctionSchema = z.object({
  key: z.string().min(1),
  /** Heading of the page when it opens. */
  name: z.string().min(1),
  /** Text of the menu item; defaults to `name`. */
  menuText: z.string().optional(),
  /** Address of the page, e.g. `/bang-luong.html`. */
  path: z.string().min(1),
});
export type PermFunction = z.infer<typeof PermFunctionSchema>;

export const PermissionMatrixSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    /** Page with the menu once logged in. */
    homePath: z.string().default('/'),
    loginPath: z.string().default('/login.html'),
    /** Labels of the login form. */
    usernameLabel: z.string().default('Tên đăng nhập'),
    passwordLabel: z.string().default('Mật khẩu'),
    loginButton: z.string().default('Đăng nhập'),
    /** Text the app shows when a page is not allowed. */
    deniedText: z.string().default('Bạn không có quyền'),
    roles: z.array(PermRoleSchema).default([]),
    functions: z.array(PermFunctionSchema).default([]),
    /** `"<roleKey>|<functionKey>"` → access. A missing cell is treated as `hidden`. */
    cells: z.record(z.string(), PermAccessSchema).default({}),
  })
  .superRefine((m, ctx) => {
    for (const [name, list] of [
      ['roles', m.roles],
      ['functions', m.functions],
    ] as const) {
      const seen = new Set<string>();
      for (const [i, x] of list.entries()) {
        if (seen.has(x.key))
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate key "${x.key}"`,
            path: [name, i, 'key'],
          });
        seen.add(x.key);
      }
    }
  });
export type PermissionMatrix = z.infer<typeof PermissionMatrixSchema>;

export const PermissionMatricesSchema = z.array(PermissionMatrixSchema).superRefine((all, ctx) => {
  const seen = new Set<string>();
  for (const [i, m] of all.entries()) {
    if (seen.has(m.id))
      ctx.addIssue({ code: 'custom', message: `Duplicate matrix id "${m.id}"`, path: [i, 'id'] });
    seen.add(m.id);
  }
});

export const cellKey = (roleKey: string, fnKey: string): string => `${roleKey}|${fnKey}`;
export const accessOf = (m: PermissionMatrix, roleKey: string, fnKey: string): PermAccess =>
  m.cells[cellKey(roleKey, fnKey)] ?? 'hidden';

/** Fixed prefix of the check ids so the result screen can find a cell: `perm:<role>|<fn>:<what>`. */
export const permCheckId = (roleKey: string, fnKey: string, what: 'menu' | 'url'): string =>
  `perm:${cellKey(roleKey, fnKey)}:${what}`;

/** Names of the tests the matrix produces. */
export const permTestName = (m: PermissionMatrix, role: PermRole): string =>
  `${m.name} — ${role.name}`;
export const permTag = (matrixId: string): string => `permission-matrix:${matrixId}`;

const menuOf = (f: PermFunction): Locator => ({
  strategies: [{ kind: 'role', role: 'link', name: f.menuText ?? f.name, exact: true }],
});

/**
 * Steps of the test for one role [Q-09]: log in, look at the menu, then open each address typed
 * directly. Every check is `soft`, so one test reports every wrong cell, named
 * "<Role> × <Function>: <what should happen>".
 */
export function permissionSteps(m: PermissionMatrix, role: PermRole): StepInput[] {
  const steps: StepInput[] = [];
  const id = (what: string) => `${what}-${steps.length + 1}`;
  const cell = (f: PermFunction) => accessOf(m, role.key, f.key);
  const label = (text: string): Locator => ({ strategies: [{ kind: 'label', value: text }] });

  steps.push({ id: id('open'), action: 'goto', params: { url: `{{app}}${m.loginPath}` } });
  steps.push({
    id: id('user'),
    action: 'fill',
    params: { target: label(m.usernameLabel), value: role.username },
    name: `Đăng nhập: ${role.name}`,
  });
  steps.push({
    id: id('pass'),
    action: 'fill',
    params: { target: label(m.passwordLabel), value: role.password },
  });
  steps.push({
    id: id('login'),
    action: 'click',
    params: {
      target: { strategies: [{ kind: 'role', role: 'button', name: m.loginButton }] },
    },
  });
  // The login page redirects by itself: wait for it, or the next goto would abort it.
  steps.push({
    id: id('signed'),
    action: 'assertUrl',
    params: { op: 'notContains', value: m.loginPath.split('?')[0] },
    name: `Đăng nhập xong: ${role.name}`,
  });
  steps.push({ id: id('home'), action: 'goto', params: { url: `{{app}}${m.homePath}` } });

  for (const f of m.functions) {
    const access = cell(f);
    steps.push({
      id: permCheckId(role.key, f.key, 'menu'),
      action: 'assertVisible',
      params: { target: menuOf(f), state: access === 'see' ? 'visible' : 'hidden' },
      name: `${role.name} × ${f.name}: ${access === 'see' ? 'có trong menu' : 'không có trong menu'}`,
      mode: 'soft',
    });
  }
  for (const f of m.functions) {
    const access = cell(f);
    if (access === 'hidden') continue;
    steps.push({
      id: id('open'),
      action: 'goto',
      params: { url: `{{app}}${f.path}` },
      name: `Mở thẳng ${f.name}`,
    });
    steps.push(
      access === 'see'
        ? {
            id: permCheckId(role.key, f.key, 'url'),
            action: 'assertVisible',
            params: {
              target: { strategies: [{ kind: 'role', role: 'heading', name: f.name }] },
              state: 'visible',
            },
            name: `${role.name} × ${f.name}: mở được trang`,
            mode: 'soft',
          }
        : {
            id: permCheckId(role.key, f.key, 'url'),
            action: 'assertVisible',
            params: {
              target: { strategies: [{ kind: 'text', value: m.deniedText }] },
              state: 'visible',
            },
            name: `${role.name} × ${f.name}: bị chặn khi mở thẳng`,
            mode: 'soft',
          },
    );
  }
  return steps;
}

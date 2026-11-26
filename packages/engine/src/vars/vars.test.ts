import { EnvSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { EngineError } from '../errors';
import { parseDate } from './dates';
import { toNumber } from './evaluate';
import { parseExpression } from './expression';
import { explainVariables, maskSecrets, VariableStore } from './store';

const NOW = new Date(2026, 10, 16, 14, 30, 5); // 16/11/2026 14:30:05 (Monday)
const env = EnvSchema.parse({
  id: 'e',
  name: 'Staging',
  baseUrl: 'https://staging.example.com',
  variables: {
    portalUrl: 'https://portal.example.com',
    apiUrl: '{{env.portalUrl}}/api',
    who: 'env',
  },
});
const store = () =>
  new VariableStore(
    {
      env,
      suite: { who: 'suite', suiteOnly: 's' },
      test: { who: 'test', soLuong: '3' },
      row: { soNgay: '2', ten: 'An' },
      secrets: { nvPass: 'P@ss-123', token: 'tok' },
    },
    () => NOW,
  );

describe('templates & scopes [E-01, E-02]', () => {
  it('replaces variables in any text', () => {
    expect(store().render('Xin chào {{row.ten}}, mở {{env.portalUrl}}')).toBe(
      'Xin chào An, mở https://portal.example.com',
    );
  });

  it('looks up bare names runtime → test → suite → env', () => {
    const s = store();
    expect(s.render('{{who}}')).toBe('test');
    expect(s.render('{{suiteOnly}}')).toBe('s');
    s.set('who', 'runtime');
    expect(s.render('{{who}}')).toBe('runtime');
  });

  it('expands variables that reference other variables', () => {
    expect(store().render('{{env.apiUrl}}/don')).toBe('https://portal.example.com/api/don');
  });

  it('exposes secrets, params and loop frames', async () => {
    const s = store();
    expect(s.render('{{secret.nvPass}}')).toBe('P@ss-123');
    await s.withFrame({ param: { user: 'an' } }, async () => {
      expect(s.render('{{param.user}}')).toBe('an');
    });
    expect(() => s.render('{{param.user}}')).toThrow(EngineError);
  });

  it('keeps types for a single expression and walks objects', () => {
    const s = store();
    s.set('resp', { body: { items: [{ id: 42 }] } });
    expect(
      s.interpolate(
        { a: '{{resp.body.items[0].id}}', b: ['{{row.ten}}'], steps: [{ x: '{{nope}}' }] },
        ['steps'],
      ),
    ).toEqual({
      a: 42,
      b: ['An'],
      steps: [{ x: '{{nope}}' }],
    });
  });

  it('reports unknown variables with their name', () => {
    const err = (() => {
      try {
        store().render('{{maDon}}');
      } catch (e) {
        return e as EngineError;
      }
      return undefined;
    })();
    expect(err?.code).toBe('UNKNOWN_VARIABLE');
    expect(err?.details).toMatchObject({ name: 'maDon' });
  });
});

describe('generators [E-05]', () => {
  it('random, timestamp, uuid, strings', () => {
    const s = store();
    expect(s.render('{{random}}')).toMatch(/^\d{6}$/);
    expect(s.render('{{timestamp}}')).toBe(String(NOW.getTime()));
    expect(s.render('{{uuid}}')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(s.render('{{randomString(12)}}')).toMatch(/^[a-z0-9]{12}$/);
    expect(s.render('{{randomDigits(4)}}')).toMatch(/^\d{4}$/);
    const n = Number(s.render('{{random(5, 7)}}'));
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(7);
  });

  it('Vietnamese fake data', () => {
    const s = store();
    expect(s.render('{{fake.name}}').length).toBeGreaterThan(3);
    expect(s.render('{{fake.phone}}')).toMatch(/^0[35789]\d{8}$/);
    expect(s.render('{{fake.email}}')).toMatch(/^[a-z]+\.[a-z0-9]{6}@example\.com$/);
    expect(s.render('{{fake.address}}')).toContain(',');
    expect(() => s.render('{{fake.nope}}')).toThrow(/fake\.nope/);
  });
});

describe('dates [E-06]', () => {
  it('today, offsets, month/week bounds, formats', () => {
    const s = store();
    expect(s.render('{{today}}')).toBe('16/11/2026');
    expect(s.render('{{today+3d}}')).toBe('19/11/2026');
    expect(s.render('{{today - 1M}}')).toBe('16/10/2026');
    expect(s.render('{{today + 2w | yyyy-MM-dd}}')).toBe('2026-11-30');
    expect(s.render('{{startOfMonth}}')).toBe('01/11/2026');
    expect(s.render('{{endOfMonth}}')).toBe('30/11/2026');
    expect(s.render('{{startOfWeek}}')).toBe('16/11/2026');
    expect(s.render('{{now | HH:mm}}')).toBe('14:30');
    expect(s.render('{{now}}')).toBe('16/11/2026 14:30:05');
    expect(s.render("{{format(date('2026-01-31') + 1M, 'dd/MM')}}")).toBe('28/02');
  });

  it('parses common date formats', () => {
    for (const t of [
      '05/03/2026',
      '5/3/2026',
      '2026-03-05',
      '05-03-2026',
      '05.03.2026',
      'Ngày 05 tháng 03 năm 2026',
    ]) {
      expect(parseDate(t)?.toDateString(), t).toBe(new Date(2026, 2, 5).toDateString());
    }
    expect(parseDate('hello')).toBeUndefined();
  });
});

describe('expressions [E-07]', () => {
  it('arithmetic, precedence, concat, rounding', () => {
    const s = store();
    expect(s.interpolate('{{row.soNgay + 1}}')).toBe(3);
    expect(s.interpolate('{{soLuong * 2 + 1}}')).toBe(7);
    expect(s.interpolate('{{(1 + 2) × 3 ÷ 2}}')).toBe(4.5);
    expect(s.interpolate('{{round(10 / 3, 2)}}')).toBe(3.33);
    expect(s.render('Mã {{row.ten & row.soNgay}}')).toBe('Mã An2');
    expect(s.render("{{'Đơn ' + row.ten}}")).toBe('Đơn An');
    expect(s.interpolate('{{-row.soNgay}}')).toBe(-2);
    expect(s.render('{{0.1 + 0.2}}')).toBe('0.3');
    expect(s.render('{{10 / 4 | 0.00}}')).toBe('2.50');
  });

  it('rejects bad expressions clearly', () => {
    expect(() => parseExpression('1 +')).toThrow(/Invalid expression/);
    expect(() => parseExpression("'abc")).toThrow(/unterminated/);
    expect(() => store().render('{{row.ten * 2}}')).toThrow(/not a number/);
    expect(() => store().render('{{1 / 0}}')).toThrow(/Division by zero/);
    expect(() => store().render('{{nope(1)}}')).toThrow(/Unknown function/);
  });

  it('reads Vietnamese and English number formats', () => {
    expect(toNumber('1.000.000')).toBe(1_000_000);
    expect(toNumber('1,000.50')).toBe(1000.5);
    expect(toNumber('1.000,50')).toBe(1000.5);
    expect(toNumber('12,5')).toBe(12.5);
    expect(toNumber('1.000 đ')).toBe(1000);
    expect(toNumber('3.5')).toBe(3.5);
    expect(toNumber('abc')).toBeUndefined();
  });
});

describe('secrets [E-08]', () => {
  it('masks every secret value', () => {
    const s = store();
    expect(maskSecrets('login an / P@ss-123 tok', s.secretValues())).toBe('login an / •••• ••••');
  });
});

describe('products × environments: {{app}} [O-02]', () => {
  const uat = EnvSchema.parse({
    id: 'e-uat',
    name: 'UAT',
    defaultProduct: 'web',
    apps: {
      web: { name: 'Web', url: 'https://uat.example.com', variables: { user: 'nv001' } },
      admin: {
        name: 'Admin',
        url: 'https://admin.uat.example.com',
        variables: { user: 'admin01', home: '{{app.admin}}/home' },
      },
      api: { name: 'API', missing: true },
    },
  });
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof EngineError ? { code: e.code, details: e.details } : String(e);
    }
    return undefined;
  };

  it('{{app}} is the main product URL; {{app.<key>}} other products; {{app.<key>.<var>}} cell variables', () => {
    const v = new VariableStore({ env: uat });
    expect(v.render('{{app}}/login')).toBe('https://uat.example.com/login');
    expect(v.render('{{app}}')).toBe('https://uat.example.com');
    expect(v.render('{{app.admin}}')).toBe('https://admin.uat.example.com');
    expect(v.render('{{app.admin.user}} / {{app.web.user}}')).toBe('admin01 / nv001');
    expect(v.render('{{app.admin.home}}')).toBe('https://admin.uat.example.com/home');
    expect(v.render('{{env.baseUrl}}')).toBe('https://uat.example.com');
  });

  it('the test’s product decides {{app}}', () => {
    const v = new VariableStore({ env: uat, product: 'admin' });
    expect(v.render('{{app}}')).toBe('https://admin.uat.example.com');
    expect(v.render('{{env.baseUrl}}')).toBe('https://admin.uat.example.com');
  });

  it('a product missing in the environment fails with a readable error only when used', () => {
    const v = new VariableStore({ env: uat });
    expect(v.render('{{app.web}}')).toBe('https://uat.example.com');
    expect(code(() => v.render('{{app.api}}/v1'))).toEqual({
      code: 'APP_NOT_AVAILABLE',
      details: { product: 'API', environment: 'UAT', key: 'api' },
    });
    expect(code(() => v.render('{{app.shop}}'))).toMatchObject({
      code: 'UNKNOWN_PRODUCT',
      details: { product: 'shop' },
    });
    expect(
      code(() => new VariableStore({ env: uat, product: 'api' }).render('{{app}}')),
    ).toMatchObject({ code: 'APP_NOT_AVAILABLE' });
  });

  it('a v1.0 environment (baseUrl only) still answers {{app}}', () => {
    const v = new VariableStore({
      env: EnvSchema.parse({ id: 'e', name: 'Old', baseUrl: 'http://x.test' }),
    });
    expect(v.render('{{app}}/a')).toBe('http://x.test/a');
    expect(v.render('{{env.baseUrl}}')).toBe('http://x.test');
  });
});

describe('inherited levels and "Giá trị hiệu lực" [O-04]', () => {
  const env = EnvSchema.parse({
    id: 'e',
    name: 'UAT',
    defaultProduct: 'web',
    variables: { timeout: '20', who: 'env' },
    apps: { web: { name: 'Web', url: 'http://w', variables: { user: 'nv001', who: 'cell' } } },
  });
  const scopes = {
    env,
    workspace: { timeout: '10', company: 'ACME' },
    project: { timeout: '15', lang: 'vi' },
    productVariables: { lang: 'en', who: 'product' },
    suite: { who: 'suite' },
    test: {},
    row: { user: 'row-user' },
  };

  it('most specific level wins: row → test → suite → cell → environment → product → project → workspace', () => {
    const v = new VariableStore(scopes);
    expect(v.render('{{timeout}} {{company}} {{lang}} {{who}} {{user}}')).toBe(
      '20 ACME en suite row-user',
    );
    expect(new VariableStore({ ...scopes, suite: {} }).render('{{who}}')).toBe('cell');
  });

  it('explains each value with its level and what it overrides', () => {
    const list = explainVariables(scopes);
    expect(list.find((x) => x.name === 'timeout')).toEqual({
      name: 'timeout',
      value: '20',
      level: 'environment',
      overridden: [
        { level: 'project', value: '15' },
        { level: 'workspace', value: '10' },
      ],
    });
    expect(list.find((x) => x.name === 'user')).toMatchObject({
      level: 'row',
      overridden: [{ level: 'cell', value: 'nv001' }],
    });
    expect(list.map((x) => x.name)).toEqual(['company', 'lang', 'timeout', 'user', 'who']);
  });
});

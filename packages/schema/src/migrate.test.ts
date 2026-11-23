import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMigrator, MIGRATIONS, MigrationError, parseTestCase } from './migrate';
import { CURRENT_SCHEMA_VERSION } from './version';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof MigrationError) return e.code;
    throw e;
  }
  return undefined;
}

describe('createMigrator (framework)', () => {
  const migrate = createMigrator(3, [
    { from: 1, migrate: (d) => ({ ...d, title: d.name, name: undefined }) },
    { from: 2, migrate: (d) => ({ ...d, tags: d.tags ?? [] }) },
  ]);

  it('walks every step from an old version to current', () => {
    const input = { schemaVersion: 1, name: 'A' };
    const out = migrate(input);
    expect(out.fromVersion).toBe(1);
    expect(out.doc).toEqual({ schemaVersion: 3, title: 'A', name: undefined, tags: [] });
    expect(input).toEqual({ schemaVersion: 1, name: 'A' }); // input untouched
  });

  it('starts mid-chain and is a no-op at current', () => {
    expect(migrate({ schemaVersion: 2, tags: ['x'] }).doc).toEqual({
      schemaVersion: 3,
      tags: ['x'],
    });
    expect(migrate({ schemaVersion: 3, a: 1 })).toEqual({
      fromVersion: 3,
      doc: { schemaVersion: 3, a: 1 },
    });
  });

  it('rejects files from a newer app, missing versions and non-objects', () => {
    expect(codeOf(() => migrate({ schemaVersion: 4 }))).toBe('NEWER_VERSION');
    expect(codeOf(() => migrate({}))).toBe('MISSING_VERSION');
    expect(codeOf(() => migrate({ schemaVersion: '1' }))).toBe('MISSING_VERSION');
    expect(codeOf(() => migrate({ schemaVersion: 0 }))).toBe('MISSING_VERSION');
    expect(codeOf(() => migrate([]))).toBe('NOT_AN_OBJECT');
    expect(codeOf(() => migrate(null))).toBe('NOT_AN_OBJECT');
  });

  it('reports a gap in the chain', () => {
    const gappy = createMigrator(3, [{ from: 2, migrate: (d) => d }]);
    expect(codeOf(() => gappy({ schemaVersion: 1 }))).toBe('NO_MIGRATION_PATH');
  });

  it('refuses invalid registrations', () => {
    expect(() =>
      createMigrator(3, [
        { from: 1, migrate: (d) => d },
        { from: 1, migrate: (d) => d },
      ]),
    ).toThrow(/Duplicate/);
    expect(() => createMigrator(2, [{ from: 2, migrate: (d) => d }])).toThrow(/current/);
  });
});

describe('real migrations', () => {
  it('cover every version below current without gaps', () => {
    expect(MIGRATIONS.map((m) => m.from)).toEqual(
      Array.from({ length: CURRENT_SCHEMA_VERSION - 1 }, (_, i) => i + 1),
    );
  });

  // N-08: every fixture of every version must open on the current app.
  const versions = readdirSync(FIXTURES).filter((d) => /^v\d+$/.test(d));

  it('has a fixture folder for every version up to current', () => {
    expect(versions.sort()).toEqual(
      Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, i) => `v${i + 1}`),
    );
  });

  for (const v of versions) {
    for (const file of readdirSync(join(FIXTURES, v)).filter((f) => f.endsWith('.kiemi.json'))) {
      it(`opens fixtures/${v}/${file}`, () => {
        const raw: unknown = JSON.parse(readFileSync(join(FIXTURES, v, file), 'utf8'));
        const { testCase, fromVersion } = parseTestCase(raw);
        expect(fromVersion).toBe(Number(v.slice(1)));
        expect(testCase.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(testCase.steps.length).toBeGreaterThan(0);
      });
    }
  }

  it('v1 → v2 turns {{env.baseUrl}} into {{app}} in steps and cleanup only [O-02]', () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(FIXTURES, 'v1', 'env-base-url.kiemi.json'), 'utf8'),
    );
    const { testCase } = parseTestCase(raw);
    expect(testCase.steps.map((s) => Object.values(s.params)[0])).toEqual([
      '{{app}}/login.html',
      '{{app}}/login.html',
    ]);
    expect(testCase.cleanup[0]?.params.url).toBe('{{app}}');
    const kept = parseTestCase({
      schemaVersion: 1,
      id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f06',
      name: '{{env.baseUrl}}',
      steps: [{ id: 's1', action: 'goto', params: { url: '{{env.name}}' } }],
    }).testCase;
    expect(kept.name).toBe('{{env.baseUrl}}');
    expect(kept.steps[0]?.params.url).toBe('{{env.name}}');
  });

  it('v2 keeps the main product and environment limits [O-01, O-06]', () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(FIXTURES, 'v2', 'two-products.kiemi.json'), 'utf8'),
    );
    const { testCase } = parseTestCase(raw);
    expect(testCase.product).toBe('web');
    expect(testCase.environments).toEqual({ except: ['Production'], reason: 'Tạo dữ liệu thật' });
  });

  it('rejects a file from a newer app with NEWER_VERSION', () => {
    expect(codeOf(() => parseTestCase({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }))).toBe(
      'NEWER_VERSION',
    );
  });
});

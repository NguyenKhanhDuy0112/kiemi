import { type TestCase, TestCaseSchema } from './test-case';
import { CURRENT_SCHEMA_VERSION } from './version';

/** Raw JSON object of some older version. */
export type RawDoc = Record<string, unknown>;

/** Upgrades a document from version `from` to `from + 1`. Must be pure. */
export interface Migration {
  from: number;
  migrate: (doc: RawDoc) => RawDoc;
}

export type MigrationErrorCode =
  | 'NOT_AN_OBJECT'
  | 'MISSING_VERSION'
  | 'NEWER_VERSION'
  | 'NO_MIGRATION_PATH';

export class MigrationError extends Error {
  constructor(
    readonly code: MigrationErrorCode,
    message: string,
    readonly version?: number,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

export interface MigrateOutcome {
  doc: RawDoc;
  /** Version the input was in. Equal to the target when nothing changed. */
  fromVersion: number;
}

/**
 * Builds a migrator that walks `vN → vN+1 → … → current`.
 * Generic so the chain logic can be tested independently of the real migrations.
 */
export function createMigrator(current: number, migrations: readonly Migration[]) {
  const byFrom = new Map<number, Migration>();
  for (const m of migrations) {
    if (byFrom.has(m.from)) throw new Error(`Duplicate migration from v${m.from}`);
    if (m.from >= current) throw new Error(`Migration from v${m.from} >= current v${current}`);
    byFrom.set(m.from, m);
  }

  return (input: unknown): MigrateOutcome => {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new MigrationError('NOT_AN_OBJECT', 'Test file must be a JSON object');
    }
    const fromVersion = (input as RawDoc).schemaVersion;
    if (typeof fromVersion !== 'number' || !Number.isInteger(fromVersion) || fromVersion < 1) {
      throw new MigrationError('MISSING_VERSION', 'Test file has no valid schemaVersion');
    }
    if (fromVersion > current) {
      throw new MigrationError(
        'NEWER_VERSION',
        `Test file is v${fromVersion}, this app supports up to v${current}`,
        fromVersion,
      );
    }
    let doc: RawDoc = structuredClone(input as RawDoc);
    for (let v = fromVersion; v < current; v++) {
      const m = byFrom.get(v);
      if (!m) {
        throw new MigrationError('NO_MIGRATION_PATH', `No migration from v${v}`, v);
      }
      doc = { ...m.migrate(doc), schemaVersion: v + 1 };
    }
    return { doc, fromVersion };
  };
}

/** Replaces `{{env.baseUrl}}` (any spacing) in every string, deep. */
function replaceBaseUrl(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\{\{\s*env\.baseUrl\s*\}\}/g, '{{app}}');
  if (Array.isArray(value)) return value.map(replaceBaseUrl);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as RawDoc).map(([k, v]) => [k, replaceBaseUrl(v)]),
  );
}

/**
 * Registered DSL migrations, oldest first.
 * Adding one: bump CURRENT_SCHEMA_VERSION, add `{ from: N, migrate }`, add fixtures/vN.
 */
export const MIGRATIONS: readonly Migration[] = [
  /** v1 → v2: products × environments — `{{env.baseUrl}}` becomes `{{app}}` [O-02, ADR 0018]. */
  {
    from: 1,
    migrate: (doc) => ({
      ...doc,
      ...(doc.steps !== undefined ? { steps: replaceBaseUrl(doc.steps) } : {}),
      ...(doc.cleanup !== undefined ? { cleanup: replaceBaseUrl(doc.cleanup) } : {}),
    }),
  },
];

export const migrateToCurrent = createMigrator(CURRENT_SCHEMA_VERSION, MIGRATIONS);

/** Migrates (if needed) and validates a parsed `.kiemi.json` document. */
export function parseTestCase(input: unknown): { testCase: TestCase; fromVersion: number } {
  const { doc, fromVersion } = migrateToCurrent(input);
  return { testCase: TestCaseSchema.parse(doc), fromVersion };
}

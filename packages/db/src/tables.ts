import type {
  Locator,
  ProxySettings,
  SharedStep,
  SshSettings,
  Step,
  TestCase,
} from '@kiemi/schema';
import { blob, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * SQLite schema (SPEC Phụ lục 2). Every table has `id` (UUIDv7), `workspaceId`,
 * `createdAt`, `updatedAt`, `deletedAt` (soft delete) and `version` (optimistic
 * concurrency, future cloud sync) — CLAUDE.md §5.6.
 *
 * Times are epoch milliseconds. JSON columns hold validated `@kiemi/schema` shapes.
 * The SQL that creates these tables lives in `migrations.ts` (kept in sync by a test).
 */
const base = {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  version: integer('version').notNull().default(1),
};

/** What a run was started for [H-01]. */
export type RunTarget =
  | { kind: 'test'; testCaseId: string; name: string }
  | { kind: 'suite'; suiteId: string; name: string }
  | { kind: 'tag'; tag: string; name: string };

const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();

export const workspaces = sqliteTable('workspaces', {
  ...base,
  name: text('name').notNull(),
});

export const projects = sqliteTable(
  'projects',
  {
    ...base,
    name: text('name').notNull(),
    description: text('description'),
    /** Project folder on disk — the shared source of truth [T-01, ADR 0018] (migration 5). */
    folderPath: text('folder_path'),
    /** `relative path → hash` at the last folder sync (three-way merge base). */
    folderState: json<Record<string, string>>('folder_state'),
  },
  (t) => [index('projects_workspace_idx').on(t.workspaceId)],
);

export const folders = sqliteTable(
  'folders',
  {
    ...base,
    projectId: text('project_id').notNull(),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('folders_project_idx').on(t.projectId)],
);

export const testCases = sqliteTable(
  'test_cases',
  {
    ...base,
    projectId: text('project_id').notNull(),
    folderId: text('folder_id'),
    name: text('name').notNull(),
    description: text('description'),
    tags: json<string[]>('tags').notNull(),
    /** The full `.kiemi.json` document (validated, current schema version). */
    content: json<TestCase>('content').notNull(),
    schemaVersion: integer('schema_version').notNull(),
  },
  (t) => [
    index('test_cases_project_idx').on(t.projectId),
    index('test_cases_folder_idx').on(t.folderId),
  ],
);

export const suites = sqliteTable(
  'suites',
  {
    ...base,
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Suite-level variables [E-02]. */
    variables: json<Record<string, string>>('variables').notNull(),
    /** Default environment for runs of this suite. */
    environmentId: text('environment_id'),
  },
  (t) => [index('suites_project_idx').on(t.projectId)],
);

export const suiteItems = sqliteTable(
  'suite_items',
  {
    ...base,
    suiteId: text('suite_id').notNull(),
    testCaseId: text('test_case_id').notNull(),
    datasetId: text('dataset_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [index('suite_items_suite_idx').on(t.suiteId)],
);

export const sharedSteps = sqliteTable(
  'shared_steps',
  {
    ...base,
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    params: json<SharedStep['params']>('params').notNull(),
    steps: json<Step[]>('steps').notNull(),
  },
  (t) => [index('shared_steps_project_idx').on(t.projectId)],
);

export const elements = sqliteTable(
  'elements',
  {
    ...base,
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    /** Strategies, scope, nth and fingerprint [C-01 → C-05]. */
    locator: json<Locator>('locator').notNull(),
    /** Page URL where it was picked (for the element library). */
    pageUrl: text('page_url'),
  },
  (t) => [index('elements_project_idx').on(t.projectId)],
);

export const environments = sqliteTable(
  'environments',
  {
    ...base,
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    baseUrl: text('base_url'),
    proxy: json<ProxySettings>('proxy'),
    /** SSH tunnel settings [G-07] (migration 2). */
    ssh: json<SshSettings>('ssh'),
    /**
     * Secret names this environment expects, even without a value on this machine
     * (project folder opened elsewhere) [O-11] (migration 5).
     */
    secretNames: json<string[]>('secret_names'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('environments_project_idx').on(t.projectId)],
);

export const variables = sqliteTable(
  'variables',
  {
    ...base,
    environmentId: text('environment_id').notNull(),
    name: text('name').notNull(),
    value: text('value').notNull(),
  },
  (t) => [index('variables_environment_idx').on(t.environmentId)],
);

export const secrets = sqliteTable(
  'secrets',
  {
    ...base,
    environmentId: text('environment_id').notNull(),
    name: text('name').notNull(),
    /** Encrypted by the OS keychain (Electron `safeStorage`) [N-07]. */
    ciphertext: blob('ciphertext', { mode: 'buffer' }).notNull(),
  },
  (t) => [index('secrets_environment_idx').on(t.environmentId)],
);

export interface DatasetSourceInfo {
  kind: 'manual' | 'excel' | 'csv';
  fileName?: string;
  sheet?: string;
}

export const datasets = sqliteTable(
  'datasets',
  {
    ...base,
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    columns: json<string[]>('columns').notNull(),
    rows: json<Record<string, string>[]>('rows').notNull(),
    source: json<DatasetSourceInfo>('source').notNull(),
  },
  (t) => [index('datasets_project_idx').on(t.projectId)],
);

export const runs = sqliteTable(
  'runs',
  {
    ...base,
    projectId: text('project_id').notNull(),
    suiteId: text('suite_id'),
    environmentId: text('environment_id'),
    status: text('status', {
      enum: ['queued', 'running', 'passed', 'failed', 'cancelled', 'error'],
    }).notNull(),
    trigger: text('trigger', { enum: ['manual', 'schedule', 'cli'] })
      .notNull()
      .default('manual'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    durationMs: integer('duration_ms'),
    /** Folder holding this run's screenshots/videos/traces. */
    artifactDir: text('artifact_dir'),
    /** What was run (one test, a suite, a tag) — for history [S-05]. */
    target: json<RunTarget>('target'),
  },
  (t) => [index('runs_project_idx').on(t.projectId)],
);

export const runCases = sqliteTable(
  'run_cases',
  {
    ...base,
    runId: text('run_id').notNull(),
    testCaseId: text('test_case_id').notNull(),
    rowIndex: integer('row_index'),
    status: text('status').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    durationMs: integer('duration_ms'),
    error: json<{ code: string; message: string; details?: Record<string, unknown> }>('error'),
  },
  (t) => [index('run_cases_run_idx').on(t.runId)],
);

export const runSteps = sqliteTable(
  'run_steps',
  {
    ...base,
    runCaseId: text('run_case_id').notNull(),
    stepId: text('step_id').notNull(),
    parentStepId: text('parent_step_id'),
    phase: text('phase', { enum: ['steps', 'cleanup'] }).notNull(),
    stepNo: text('step_no').notNull(),
    session: text('session').notNull(),
    status: text('status').notNull(),
    soft: integer('soft', { mode: 'boolean' }).notNull().default(false),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    durationMs: integer('duration_ms'),
    error: json<{ code: string; message: string; details?: Record<string, unknown> }>('error'),
  },
  (t) => [index('run_steps_case_idx').on(t.runCaseId)],
);

export const artifacts = sqliteTable(
  'artifacts',
  {
    ...base,
    runId: text('run_id').notNull(),
    runCaseId: text('run_case_id'),
    runStepId: text('run_step_id'),
    kind: text('kind', { enum: ['screenshot', 'video', 'trace', 'html', 'log'] }).notNull(),
    /** Relative to the run's artifact folder. */
    path: text('path').notNull(),
  },
  (t) => [index('artifacts_run_idx').on(t.runId)],
);

export const settings = sqliteTable(
  'settings',
  {
    ...base,
    key: text('key').notNull(),
    value: json<unknown>('value').notNull(),
  },
  (t) => [uniqueIndex('settings_workspace_key_idx').on(t.workspaceId, t.key)],
);

/** Saved login sessions (cookies + localStorage), reused by later tests until they expire [F-02]. */
export const savedLogins = sqliteTable(
  'saved_logins',
  {
    ...base,
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    /** Playwright storage state (JSON), encrypted like secrets [N-07]. */
    ciphertext: blob('ciphertext', { mode: 'buffer' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('saved_logins_project_idx').on(t.projectId)],
);

export const ALL_TABLES = {
  workspaces,
  projects,
  folders,
  testCases,
  suites,
  suiteItems,
  sharedSteps,
  elements,
  environments,
  variables,
  secrets,
  datasets,
  runs,
  runCases,
  runSteps,
  artifacts,
  settings,
  savedLogins,
} as const;

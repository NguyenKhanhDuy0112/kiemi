import type {
  ClientCert,
  DbConnection,
  FormSpec,
  Formulas,
  HttpAuth,
  Locator,
  ManualCase,
  MessageCatalog,
  NotifyConfig,
  PageDecl,
  PermissionMatrix,
  PopupRule,
  ProxySettings,
  Requirement,
  SharedStep,
  SshSettings,
  Step,
  TestCase,
  TestPlan,
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
    /** Project-level variables [O-04] (migration 9). */
    variables: json<Record<string, string>>('variables'),
    /** Popups handled in every test of the project [W-09] (migration 11). */
    popupRules: json<PopupRule[]>('popup_rules'),
    /** Field specs of the project's forms [R-01] (migration 12). */
    formSpecs: json<FormSpec[]>('form_specs'),
    /** Error messages the project changed [R-10] (migration 13). */
    messageCatalog: json<MessageCatalog>('message_catalog'),
    /** Pages of the project that should be tested [CV-02] (migration 14). */
    pages: json<PageDecl[]>('pages'),
    /** Named formulas of the project [P-03] (migration 16). */
    formulas: json<Formulas>('formulas'),
    /** Test cases written for people to run by hand [T-03] (migration 19). */
    manualCases: json<ManualCase[]>('manual_cases'),
    /** Test rounds per release [T-02] (migration 20). */
    testPlans: json<TestPlan[]>('test_plans'),
    /** Role × function permission matrices [Q-09] (migration 21). */
    permissionMatrices: json<PermissionMatrix[]>('permission_matrices'),
    /** Requirements / tickets tests are linked to [T-04] (migration 26). */
    requirements: json<Requirement[]>('requirements'),
    /** One coverage score per day, for the trend [CV-09] (migration 28, this machine only). */
    coverageHistory: json<{ day: string; score: number }[]>('coverage_history'),
  },
  (t) => [index('projects_workspace_idx').on(t.workspaceId)],
);

/** Products of a project (web, admin, API…) [O-01] (migration 6). */
export const products = sqliteTable(
  'products',
  {
    ...base,
    projectId: text('project_id').notNull(),
    /** Unique in the project; used in `{{app.<key>}}` and as `tests/<key>/`. */
    key: text('key').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['web', 'api', 'app', 'module'] })
      .notNull()
      .default('web'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Product-level variables [O-04] (migration 9). */
    variables: json<Record<string, string>>('variables'),
  },
  (t) => [index('products_project_idx').on(t.projectId)],
);

export const folders = sqliteTable(
  'folders',
  {
    ...base,
    projectId: text('project_id').notNull(),
    /** Product the folder belongs to [O-01] (migration 6). */
    productId: text('product_id'),
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
    /** Product the test belongs to [O-01] (migration 6). */
    productId: text('product_id'),
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
    /** `null` = shared by every product of the project [O-07] (migration 6). */
    productId: text('product_id'),
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
    /** Each product has its own element library [O-01] (migration 6). */
    productId: text('product_id'),
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
    /**
     * 1 = v1.0 row whose `baseUrl/proxy/ssh` still wait to move into a cell of the
     * default product (`EnvironmentService.backfillCells`) [O-02] (migration 7).
     * Those three columns are legacy: cells hold them now.
     */
    cellsPending: integer('cells_pending').notNull().default(0),
    /** Dev · Test · UAT · Staging · Production · Other [O-03] (migration 8). */
    type: text('type', { enum: ['dev', 'test', 'uat', 'staging', 'production', 'other'] })
      .notNull()
      .default('other'),
    /** `#RRGGBB`; null = the type's colour. */
    color: text('color'),
    /** Refuses steps that write data [W-10]; on by default for Production. */
    protected: integer('protected', { mode: 'boolean' }).notNull().default(false),
    /** How numbers/money read and print on this environment; null = `vi` [P-10] (migration 17). */
    locale: text('locale', { enum: ['vi', 'en'] }),
    /** HTTP Basic / NTLM login of the environment (password = secret name) [W-01] (migration 18). */
    httpAuth: json<HttpAuth>('http_auth'),
    /** Databases tests can query on this environment [X-05] (migration 23). */
    dbConnections: json<DbConnection[]>('db_connections'),
    /** Client certificates for mutual-TLS sites [W-02] (migration 25). */
    clientCerts: json<ClientCert[]>('client_certs'),
  },
  (t) => [index('environments_project_idx').on(t.projectId)],
);

/**
 * One cell of the Environment × Product matrix [O-02] (migration 7): the
 * product's URL, variables and network in that environment. No row = the
 * product is not available in the environment.
 */
export const environmentProducts = sqliteTable(
  'environment_products',
  {
    ...base,
    projectId: text('project_id').notNull(),
    environmentId: text('environment_id').notNull(),
    productId: text('product_id').notNull(),
    url: text('url'),
    variables: json<Record<string, string>>('variables').notNull(),
    proxy: json<ProxySettings>('proxy'),
    ssh: json<SshSettings>('ssh'),
  },
  (t) => [
    index('environment_products_environment_idx').on(t.environmentId),
    index('environment_products_project_idx').on(t.projectId),
  ],
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

export interface DatasetChildRow {
  name: string;
  key: string;
  parentKey: string;
  columns: string[];
  rows: Record<string, string>[];
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
    /** Rows used instead on some environments, by environment id [O-05] (migration 9). */
    envRows: json<Record<string, Record<string, string>[]>>('env_rows'),
    /** Linked child tables, e.g. one sheet each [P-01] (migration 15). */
    children: json<DatasetChildRow[]>('children'),
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
    /** Values noted by `observe`, to compare runs [V-06] (migration 24). */
    observations: json<Record<string, string>>('observations'),
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

/** Where run results are announced: Slack, Teams, Google Chat, Telegram, email [X-03]. */
/** Earlier saved versions of a test, newest last kept up to a limit [T-05] (migration 27). */
export const testVersions = sqliteTable(
  'test_versions',
  {
    ...base,
    testCaseId: text('test_case_id').notNull(),
    /** `version` the test row had when this content was the current one. */
    savedVersion: integer('saved_version').notNull(),
    name: text('name').notNull(),
    content: json<TestCase>('content').notNull(),
  },
  (t) => [index('test_versions_test_idx').on(t.testCaseId)],
);

export const notifyChannels = sqliteTable(
  'notify_channels',
  {
    ...base,
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['slack', 'teams', 'gchat', 'telegram', 'email'] }).notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    sendWhen: text('send_when', { enum: ['always', 'failed'] })
      .notNull()
      .default('always'),
    /** Non-secret settings (chat id, SMTP host…). */
    config: json<NotifyConfig>('config'),
    /** Webhook URL / bot token / SMTP password, encrypted like secrets [N-07]. */
    ciphertext: blob('ciphertext', { mode: 'buffer' }),
    /** Result of the last send, to show in settings. */
    lastOk: integer('last_ok', { mode: 'boolean' }),
    lastMessage: text('last_message'),
    lastAt: integer('last_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('notify_channels_project_idx').on(t.projectId)],
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

/** What a shared resource is; its `data` shape depends on it [O-07]. */
export type SharedResourceKind = 'shared_step' | 'element';
/** Where a shared resource applies [O-07]. */
export type SharedResourceScope = 'workspace' | 'project' | 'product';
/** `data` of a `shared_step` is `{ params, steps }`; of an `element` is `{ locator, pageUrl }`. */
export type SharedResourceData =
  | { params: SharedStep['params']; steps: Step[] }
  | { locator: Locator; pageUrl?: string | null };

/**
 * Resources shared beyond one project: the workspace library (used across projects) [O-07]
 * (migration 10). Project/product-level steps and elements stay in their own tables.
 */
export const sharedResources = sqliteTable(
  'shared_resources',
  {
    ...base,
    kind: text('kind').$type<SharedResourceKind>().notNull(),
    scope: text('scope').$type<SharedResourceScope>().notNull(),
    /** `null` for the workspace scope. */
    projectId: text('project_id'),
    /** Only for the product scope. */
    productId: text('product_id'),
    name: text('name').notNull(),
    data: json<SharedResourceData>('data').notNull(),
  },
  (t) => [index('shared_resources_workspace_idx').on(t.workspaceId)],
);

export const ALL_TABLES = {
  workspaces,
  projects,
  products,
  folders,
  testCases,
  suites,
  suiteItems,
  sharedSteps,
  elements,
  environments,
  environmentProducts,
  variables,
  secrets,
  datasets,
  runs,
  runCases,
  runSteps,
  artifacts,
  settings,
  savedLogins,
  notifyChannels,
  testVersions,
  sharedResources,
} as const;

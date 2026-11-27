/**
 * Database migrations, applied in order inside a transaction and recorded in
 * `_kiemi_migrations`. SQL is embedded (not read from disk) so the bundled
 * Electron main process needs no extra files.
 *
 * NEVER edit a migration that has shipped: add a new one. A test checks that
 * the database after all migrations matches the Drizzle tables in `tables.ts`.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'init',
    sql: `
CREATE TABLE "workspaces" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL
);
CREATE TABLE "projects" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL,
  "description" TEXT
);
CREATE INDEX "projects_workspace_idx" ON "projects" ("workspace_id");
CREATE TABLE "folders" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "parent_id" TEXT,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "folders_project_idx" ON "folders" ("project_id");
CREATE TABLE "test_cases" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "folder_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "tags" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL
);
CREATE INDEX "test_cases_project_idx" ON "test_cases" ("project_id");
CREATE INDEX "test_cases_folder_idx" ON "test_cases" ("folder_id");
CREATE TABLE "suites" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "variables" TEXT NOT NULL,
  "environment_id" TEXT
);
CREATE INDEX "suites_project_idx" ON "suites" ("project_id");
CREATE TABLE "suite_items" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "suite_id" TEXT NOT NULL,
  "test_case_id" TEXT NOT NULL,
  "dataset_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "enabled" INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX "suite_items_suite_idx" ON "suite_items" ("suite_id");
CREATE TABLE "shared_steps" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "params" TEXT NOT NULL,
  "steps" TEXT NOT NULL
);
CREATE INDEX "shared_steps_project_idx" ON "shared_steps" ("project_id");
CREATE TABLE "elements" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "locator" TEXT NOT NULL,
  "page_url" TEXT
);
CREATE INDEX "elements_project_idx" ON "elements" ("project_id");
CREATE TABLE "environments" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "base_url" TEXT,
  "proxy" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "environments_project_idx" ON "environments" ("project_id");
CREATE TABLE "variables" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "environment_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "value" TEXT NOT NULL
);
CREATE INDEX "variables_environment_idx" ON "variables" ("environment_id");
CREATE TABLE "secrets" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "environment_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ciphertext" BLOB NOT NULL
);
CREATE INDEX "secrets_environment_idx" ON "secrets" ("environment_id");
CREATE TABLE "datasets" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "columns" TEXT NOT NULL,
  "rows" TEXT NOT NULL,
  "source" TEXT NOT NULL
);
CREATE INDEX "datasets_project_idx" ON "datasets" ("project_id");
CREATE TABLE "runs" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "suite_id" TEXT,
  "environment_id" TEXT,
  "status" TEXT NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'manual',
  "started_at" INTEGER,
  "finished_at" INTEGER,
  "duration_ms" INTEGER,
  "artifact_dir" TEXT
);
CREATE INDEX "runs_project_idx" ON "runs" ("project_id");
CREATE TABLE "run_cases" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "run_id" TEXT NOT NULL,
  "test_case_id" TEXT NOT NULL,
  "row_index" INTEGER,
  "status" TEXT NOT NULL,
  "started_at" INTEGER,
  "duration_ms" INTEGER,
  "error" TEXT
);
CREATE INDEX "run_cases_run_idx" ON "run_cases" ("run_id");
CREATE TABLE "run_steps" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "run_case_id" TEXT NOT NULL,
  "step_id" TEXT NOT NULL,
  "parent_step_id" TEXT,
  "phase" TEXT NOT NULL,
  "step_no" TEXT NOT NULL,
  "session" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "soft" INTEGER NOT NULL DEFAULT 0,
  "started_at" INTEGER,
  "duration_ms" INTEGER,
  "error" TEXT
);
CREATE INDEX "run_steps_case_idx" ON "run_steps" ("run_case_id");
CREATE TABLE "artifacts" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "run_id" TEXT NOT NULL,
  "run_case_id" TEXT,
  "run_step_id" TEXT,
  "kind" TEXT NOT NULL,
  "path" TEXT NOT NULL
);
CREATE INDEX "artifacts_run_idx" ON "artifacts" ("run_id");
CREATE TABLE "settings" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL
);
CREATE UNIQUE INDEX "settings_workspace_key_idx" ON "settings" ("workspace_id", "key");
`,
  },
  {
    id: 2,
    name: 'environment-ssh',
    sql: 'ALTER TABLE "environments" ADD COLUMN "ssh" TEXT;',
  },
  {
    id: 3,
    name: 'run-target',
    sql: 'ALTER TABLE "runs" ADD COLUMN "target" TEXT;',
  },
  {
    id: 4,
    name: 'saved-logins',
    sql: `CREATE TABLE "saved_logins" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ciphertext" BLOB NOT NULL,
  "expires_at" INTEGER NOT NULL
);
CREATE INDEX "saved_logins_project_idx" ON "saved_logins" ("project_id");`,
  },
  {
    id: 5,
    name: 'project-folders',
    sql: `ALTER TABLE "projects" ADD COLUMN "folder_path" TEXT;
ALTER TABLE "projects" ADD COLUMN "folder_state" TEXT;
ALTER TABLE "environments" ADD COLUMN "secret_names" TEXT;`,
  },
  {
    id: 6,
    name: 'products',
    sql: `CREATE TABLE "products" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'web',
  "sort_order" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "products_project_idx" ON "products" ("project_id");
ALTER TABLE "folders" ADD COLUMN "product_id" TEXT;
ALTER TABLE "test_cases" ADD COLUMN "product_id" TEXT;
ALTER TABLE "shared_steps" ADD COLUMN "product_id" TEXT;
ALTER TABLE "elements" ADD COLUMN "product_id" TEXT;`,
  },
  {
    id: 7,
    name: 'environment-products',
    sql: `CREATE TABLE "environment_products" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "environment_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "url" TEXT,
  "variables" TEXT NOT NULL,
  "proxy" TEXT,
  "ssh" TEXT
);
CREATE INDEX "environment_products_environment_idx" ON "environment_products" ("environment_id");
CREATE INDEX "environment_products_project_idx" ON "environment_products" ("project_id");
ALTER TABLE "environments" ADD COLUMN "cells_pending" INTEGER NOT NULL DEFAULT 0;
UPDATE "environments" SET "cells_pending" = 1;`,
  },
  {
    id: 8,
    name: 'environment-type',
    sql: `ALTER TABLE "environments" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "environments" ADD COLUMN "color" TEXT;
ALTER TABLE "environments" ADD COLUMN "protected" INTEGER NOT NULL DEFAULT 0;
UPDATE "environments" SET "type" = 'production', "protected" = 1
  WHERE lower("name") IN ('production', 'prod', 'live', 'thật', 'that', 'chính thức');
UPDATE "environments" SET "type" = 'uat' WHERE lower("name") = 'uat';
UPDATE "environments" SET "type" = 'staging' WHERE lower("name") IN ('staging', 'stg');
UPDATE "environments" SET "type" = 'dev' WHERE lower("name") IN ('dev', 'development');
UPDATE "environments" SET "type" = 'test' WHERE lower("name") IN ('test', 'qa', 'sit');`,
  },
  {
    id: 9,
    name: 'variable-levels',
    sql: `ALTER TABLE "projects" ADD COLUMN "variables" TEXT;
ALTER TABLE "products" ADD COLUMN "variables" TEXT;
ALTER TABLE "datasets" ADD COLUMN "env_rows" TEXT;`,
  },
  {
    id: 10,
    name: 'shared-resources',
    sql: `CREATE TABLE "shared_resources" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "kind" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "project_id" TEXT,
  "product_id" TEXT,
  "name" TEXT NOT NULL,
  "data" TEXT NOT NULL
);
CREATE INDEX "shared_resources_workspace_idx" ON "shared_resources" ("workspace_id");`,
  },
  {
    id: 11,
    name: 'popup-rules',
    sql: `ALTER TABLE "projects" ADD COLUMN "popup_rules" TEXT;`,
  },
  {
    id: 12,
    name: 'form-specs',
    sql: `ALTER TABLE "projects" ADD COLUMN "form_specs" TEXT;`,
  },
  {
    id: 13,
    name: 'message-catalog',
    sql: `ALTER TABLE "projects" ADD COLUMN "message_catalog" TEXT;`,
  },
  {
    id: 14,
    name: 'project-pages',
    sql: `ALTER TABLE "projects" ADD COLUMN "pages" TEXT;`,
  },
  {
    id: 15,
    name: 'dataset-children',
    sql: `ALTER TABLE "datasets" ADD COLUMN "children" TEXT;`,
  },
  {
    id: 16,
    name: 'project-formulas',
    sql: `ALTER TABLE "projects" ADD COLUMN "formulas" TEXT;`,
  },
  {
    id: 17,
    name: 'environment-locale',
    sql: `ALTER TABLE "environments" ADD COLUMN "locale" TEXT;`,
  },
  {
    id: 18,
    name: 'environment-http-auth',
    sql: `ALTER TABLE "environments" ADD COLUMN "http_auth" TEXT;`,
  },
  {
    id: 19,
    name: 'project-manual-cases',
    sql: `ALTER TABLE "projects" ADD COLUMN "manual_cases" TEXT;`,
  },
  {
    id: 20,
    name: 'project-test-plans',
    sql: `ALTER TABLE "projects" ADD COLUMN "test_plans" TEXT;`,
  },
  {
    id: 21,
    name: 'project-permission-matrices',
    sql: `ALTER TABLE "projects" ADD COLUMN "permission_matrices" TEXT;`,
  },
  {
    id: 22,
    name: 'notify-channels',
    sql: `CREATE TABLE "notify_channels" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "send_when" TEXT NOT NULL DEFAULT 'always',
  "config" TEXT,
  "ciphertext" BLOB,
  "last_ok" INTEGER,
  "last_message" TEXT,
  "last_at" INTEGER
);
CREATE INDEX "notify_channels_project_idx" ON "notify_channels" ("project_id");`,
  },
  {
    id: 23,
    name: 'environment-db-connections',
    sql: `ALTER TABLE "environments" ADD COLUMN "db_connections" TEXT;`,
  },
  {
    id: 24,
    name: 'run-case-observations',
    sql: `ALTER TABLE "run_cases" ADD COLUMN "observations" TEXT;`,
  },
  {
    id: 25,
    name: 'environment-client-certs',
    sql: `ALTER TABLE "environments" ADD COLUMN "client_certs" TEXT;`,
  },
  {
    id: 26,
    name: 'project-requirements',
    sql: `ALTER TABLE "projects" ADD COLUMN "requirements" TEXT;`,
  },
  {
    id: 27,
    name: 'test-versions',
    sql: `CREATE TABLE "test_versions" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "test_case_id" TEXT NOT NULL,
  "saved_version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "content" TEXT NOT NULL
);
CREATE INDEX "test_versions_test_idx" ON "test_versions" ("test_case_id");`,
  },
  {
    id: 28,
    name: 'project-coverage-history',
    sql: `ALTER TABLE "projects" ADD COLUMN "coverage_history" TEXT;`,
  },
];

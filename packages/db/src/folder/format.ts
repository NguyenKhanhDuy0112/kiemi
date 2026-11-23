import { createHash } from 'node:crypto';
import {
  LocatorSchema,
  ProxySchema,
  SharedStepSchema,
  SshSettingsSchema,
  type TestCase,
  VariableNameSchema,
} from '@kiemi/schema';
import { z } from 'zod';

/**
 * On-disk format of a project folder (ADR 0018). Everything the team shares lives
 * here; machine-only data (runs, secret values, saved logins, settings) stays in SQLite.
 */
export const PROJECT_FORMAT = 'kiemi-project';
export const PROJECT_FORMAT_VERSION = 1;

export const META_DIR = '.kiemi';
export const TESTS_DIR = 'tests';
export const TEST_EXT = '.kiemi.json';
export const PATHS = {
  project: `${META_DIR}/project.json`,
  folders: `${META_DIR}/folders.json`,
  environments: `${META_DIR}/environments.json`,
  elements: `${META_DIR}/elements.json`,
  sharedSteps: `${META_DIR}/shared-steps`,
  datasets: `${META_DIR}/datasets`,
  suites: `${META_DIR}/suites`,
  /** Machine-only (locks…): never synced, ignored by Git. */
  local: `${META_DIR}/local`,
  /** Soft locks "X is editing this test" — visible on a network share, ignored by Git. */
  locks: `${META_DIR}/locks`,
  gitignore: `${META_DIR}/.gitignore`,
} as const;

/** Directory names never scanned. */
export const SKIP_DIRS = new Set(['.git', 'node_modules', '.svn', '.hg']);

const id = z.string().min(1);

export const ProjectFileSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  formatVersion: z.number().int().positive(),
  id,
  name: z.string().trim().min(1),
  description: z.string().nullish(),
});

export const FolderEntrySchema = z.object({
  id,
  parentId: id.nullable().default(null),
  name: z.string().trim().min(1),
  sortOrder: z.number().int().default(0),
});
export const FoldersFileSchema = z.object({ folders: z.array(FolderEntrySchema).default([]) });

export const EnvironmentEntrySchema = z.object({
  id,
  name: z.string().trim().min(1),
  baseUrl: z.string().nullish(),
  proxy: ProxySchema.nullish(),
  ssh: SshSettingsSchema.nullish(),
  variables: z.record(VariableNameSchema, z.string()).default({}),
  /** Names only — secret values never live in the project folder [O-11]. */
  secretNames: z.array(VariableNameSchema).default([]),
  sortOrder: z.number().int().default(0),
});
export const EnvironmentsFileSchema = z.object({
  environments: z.array(EnvironmentEntrySchema).default([]),
});

export const ElementEntrySchema = z.object({
  id,
  name: z.string().trim().min(1),
  locator: LocatorSchema,
  pageUrl: z.string().nullish(),
});
export const ElementsFileSchema = z.object({ elements: z.array(ElementEntrySchema).default([]) });

export const SharedStepFileSchema = SharedStepSchema;

export const DatasetFileSchema = z.object({
  id,
  name: z.string().trim().min(1),
  columns: z.array(z.string().min(1)),
  rows: z.array(z.record(z.string(), z.string())).default([]),
  source: z
    .object({
      kind: z.enum(['manual', 'excel', 'csv']),
      fileName: z.string().optional(),
      sheet: z.string().optional(),
    })
    .default({ kind: 'manual' }),
});

export const SuiteFileSchema = z.object({
  id,
  name: z.string().trim().min(1),
  description: z.string().nullish(),
  variables: z.record(VariableNameSchema, z.string()).default({}),
  environmentId: id.nullish(),
  items: z
    .array(
      z.object({
        testCaseId: id,
        datasetId: id.nullish(),
        enabled: z.boolean().default(true),
      }),
    )
    .default([]),
});

export type FolderEntry = z.infer<typeof FolderEntrySchema>;
export type EnvironmentEntry = z.infer<typeof EnvironmentEntrySchema>;
export type ElementEntry = z.infer<typeof ElementEntrySchema>;
export type SharedStepEntry = z.infer<typeof SharedStepFileSchema>;
export type DatasetEntry = z.infer<typeof DatasetFileSchema>;
export type SuiteEntry = z.infer<typeof SuiteFileSchema>;

/** Everything of one project that is shared through its folder. */
export interface ProjectSnapshot {
  project: { id: string; name: string; description: string | null };
  folders: FolderEntry[];
  tests: { id: string; folderId: string | null; content: TestCase }[];
  environments: EnvironmentEntry[];
  elements: ElementEntry[];
  sharedSteps: SharedStepEntry[];
  datasets: DatasetEntry[];
  suites: SuiteEntry[];
}

/** Diff-friendly JSON: 2-space indent, LF, trailing newline [T-01]. */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Same text regardless of BOM / Windows line endings (Git `autocrlf`). */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

export function hashText(text: string): string {
  return createHash('sha1').update(normalizeText(text)).digest('hex');
}

/** Is this relative (posix) path one the sync manages? */
export function isManagedPath(path: string): boolean {
  if (
    path === PATHS.project ||
    path === PATHS.folders ||
    path === PATHS.environments ||
    path === PATHS.elements
  )
    return true;
  for (const dir of [PATHS.sharedSteps, PATHS.datasets, PATHS.suites]) {
    if (
      path.startsWith(`${dir}/`) &&
      path.endsWith('.json') &&
      !path.slice(dir.length + 1).includes('/')
    )
      return true;
  }
  return path.startsWith(`${TESTS_DIR}/`) && path.endsWith(TEST_EXT);
}

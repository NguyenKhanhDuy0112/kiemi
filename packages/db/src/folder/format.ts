import { createHash } from 'node:crypto';
import {
  ClientCertsSchema,
  DatasetChildSchema,
  DbConnectionsSchema,
  EnvColorSchema,
  EnvTypeSchema,
  type FormSpec,
  FormSpecsSchema,
  type Formulas,
  FormulasSchema,
  HttpAuthSchema,
  LocatorSchema,
  type ManualCase,
  ManualCasesSchema,
  type MessageCatalog,
  MessageCatalogSchema,
  type PageDecl,
  PageDeclsSchema,
  PermissionMatricesSchema,
  type PermissionMatrix,
  type PopupRule,
  PopupRulesSchema,
  ProductSchema,
  ProxySchema,
  type Requirement,
  RequirementsSchema,
  SharedStepSchema,
  SshSettingsSchema,
  type TestCase,
  type TestPlan,
  TestPlansSchema,
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
  products: `${META_DIR}/products.json`,
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
  /** Project-level variables [O-04]. */
  variables: z.record(VariableNameSchema, z.string()).default({}),
  /** Popups closed in every test [W-09]. */
  popupRules: PopupRulesSchema.default([]),
  /** Field specs of the project's forms [R-01]. */
  formSpecs: FormSpecsSchema.default([]),
  /** Error messages the project changed [R-10]. */
  messageCatalog: MessageCatalogSchema.default({}),
  /** Pages that should be tested [CV-02]. */
  pages: PageDeclsSchema.default([]),
  /** Named formulas [P-03]. */
  formulas: FormulasSchema.default({}),
  /** Manual test cases [T-03]. */
  manualCases: ManualCasesSchema.default([]),
  /** Test rounds [T-02]. */
  testPlans: TestPlansSchema.default([]),
  /** Permission matrices [Q-09]. */
  permissionMatrices: PermissionMatricesSchema.default([]),
  /** Requirements / tickets [T-04]. */
  requirements: RequirementsSchema.default([]),
  /** Notes the AI assistant reads every session [AI-20]. */
  notes: z.string().max(20000).default(''),
});

export const ProductsFileSchema = z.object({ products: z.array(ProductSchema).default([]) });

export const FolderEntrySchema = z.object({
  id,
  /** Missing = the project's first product. */
  productId: id.nullish(),
  parentId: id.nullable().default(null),
  name: z.string().trim().min(1),
  sortOrder: z.number().int().default(0),
});
export const FoldersFileSchema = z.object({ folders: z.array(FolderEntrySchema).default([]) });

/** One cell of the Environment × Product matrix [O-02]. */
export const CellEntrySchema = z.object({
  productId: id,
  url: z.string().nullish(),
  variables: z.record(VariableNameSchema, z.string()).default({}),
  proxy: ProxySchema.nullish(),
  ssh: SshSettingsSchema.nullish(),
});

export const EnvironmentEntrySchema = z.object({
  id,
  name: z.string().trim().min(1),
  type: EnvTypeSchema.default('other'),
  color: EnvColorSchema.nullish(),
  protected: z.boolean().default(false),
  locale: z.enum(['vi', 'en']).nullish(),
  httpAuth: HttpAuthSchema.nullish(),
  dbConnections: DbConnectionsSchema.nullish(),
  clientCerts: ClientCertsSchema.nullish(),
  /** Read only (files written before M9-05) → the first product's cell. */
  baseUrl: z.string().nullish(),
  proxy: ProxySchema.nullish(),
  ssh: SshSettingsSchema.nullish(),
  cells: z.array(CellEntrySchema).default([]),
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
  productId: id.nullish(),
  name: z.string().trim().min(1),
  locator: LocatorSchema,
  pageUrl: z.string().nullish(),
});
export const ElementsFileSchema = z.object({ elements: z.array(ElementEntrySchema).default([]) });

/** `productId` null/missing = shared by every product [O-07]. */
export const SharedStepFileSchema = SharedStepSchema.extend({ productId: id.nullish() });

export const DatasetFileSchema = z.object({
  id,
  name: z.string().trim().min(1),
  columns: z.array(z.string().min(1)),
  rows: z.array(z.record(z.string(), z.string())).default([]),
  children: z.array(DatasetChildSchema).optional(),
  source: z
    .object({
      kind: z.enum(['manual', 'excel', 'csv']),
      fileName: z.string().optional(),
      sheet: z.string().optional(),
    })
    .default({ kind: 'manual' }),
  /** Rows per environment id [O-05]. */
  envRows: z.record(id, z.array(z.record(z.string(), z.string()))).default({}),
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

export type ProductEntry = z.infer<typeof ProductSchema>;
export type FolderEntry = z.infer<typeof FolderEntrySchema>;
export type EnvironmentEntry = z.infer<typeof EnvironmentEntrySchema>;
export type CellEntry = z.infer<typeof CellEntrySchema>;
export type ElementEntry = z.infer<typeof ElementEntrySchema>;
export type SharedStepEntry = z.infer<typeof SharedStepFileSchema>;
export type DatasetEntry = z.infer<typeof DatasetFileSchema>;
export type SuiteEntry = z.infer<typeof SuiteFileSchema>;

/** Everything of one project that is shared through its folder. */
export interface ProjectSnapshot {
  project: {
    id: string;
    name: string;
    description: string | null;
    variables: Record<string, string>;
    popupRules: PopupRule[];
    formSpecs: FormSpec[];
    messageCatalog: MessageCatalog;
    pages: PageDecl[];
    formulas: Formulas;
    manualCases: ManualCase[];
    testPlans: TestPlan[];
    permissionMatrices: PermissionMatrix[];
    requirements: Requirement[];
    notes: string;
  };
  /** Ordered; never empty once read from the database. */
  products: ProductEntry[];
  folders: FolderEntry[];
  tests: { id: string; productId: string | null; folderId: string | null; content: TestCase }[];
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
    path === PATHS.products ||
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

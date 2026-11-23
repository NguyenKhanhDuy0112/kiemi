import {
  DatasetInputSchema,
  ElementInputSchema,
  EnvironmentInputSchema,
  excelSheets,
  exportBundle,
  exportTestCase,
  FolderInputSchema,
  importBundle,
  importTestCase,
  NewTestCaseSchema,
  ProductInputSchema,
  ProjectInputSchema,
  SharedStepInputSchema,
  SuiteInputSchema,
  SuiteItemInputSchema,
} from '@kiemi/db';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

const id = z.string().min(1);
const version = z.number().int().positive().optional();
/** Files travel as base64 between renderer and main (renderer has no file system). */
const base64 = z.string().max(150 * 1024 * 1024);
const bytes = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'));

export const projectsRouter = router({
  list: publicProcedure.query(({ ctx }) => ctx.services.projects.list()),
  get: publicProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => ctx.services.projects.get(input.id)),
  create: publicProcedure
    .input(ProjectInputSchema)
    .mutation(({ ctx, input }) => ctx.services.projects.create(input)),
  update: publicProcedure
    .input(z.object({ id, version, patch: ProjectInputSchema.partial() }))
    .mutation(({ ctx, input }) =>
      ctx.services.projects.update(input.id, input.patch, input.version),
    ),
  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.projects.remove(input.id)),
  restore: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.projects.repo.restore(input.id)),
  /** Where the project lives on disk and whether it is in step [T-01]. */
  folder: publicProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => ctx.projectFolders?.status(input.id) ?? null),
  /** Writes / loads now (e.g. after the folder came back). */
  syncFolder: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.projectFolders?.syncProject(input.id).status ?? null),
  /** Opens an existing project folder chosen by the user (Git clone, network share) [O-11]. */
  openFolder: publicProcedure
    .input(z.object({ title: z.string().max(200) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.projectFolders || !ctx.desktop) return null;
      const dir = await ctx.desktop.pickFolder(input.title);
      return dir ? ctx.projectFolders.open(dir) : null;
    }),
  /** User's choice per conflicting file: keep the app's version or take the folder's [T-01]. */
  resolveConflicts: publicProcedure
    .input(
      z.object({
        id,
        choices: z.record(z.string().max(1000), z.enum(['local', 'remote'])),
      }),
    )
    .mutation(
      ({ ctx, input }) =>
        ctx.projectFolders?.syncProject(input.id, { resolve: input.choices }).status ?? null,
    ),
  /** Pushes "reload" when teammates' changes were loaded from the folder. */
  folderEvents: publicProcedure.subscription(async function* ({ ctx, signal }) {
    if (!ctx.projectFolders) return;
    yield* ctx.projectFolders.events(signal);
  }),
  /** Soft lock while a test is open in the editor; returns who else is editing it. */
  touchLock: publicProcedure.input(z.object({ testId: id })).mutation(({ ctx, input }) => ({
    heldBy: ctx.projectFolders?.touchLock(input.testId) ?? null,
  })),
  releaseLock: publicProcedure.input(z.object({ testId: id })).mutation(({ ctx, input }) => {
    ctx.projectFolders?.releaseLock(input.testId);
  }),
  revealFolder: publicProcedure.input(z.object({ id })).mutation(({ ctx, input }) => {
    const path = ctx.services.projects.get(input.id).folderPath;
    if (path) ctx.desktop?.openFolder(path);
  }),
});

/** Products of a project (web, admin, API…) [O-01]. */
export const productsRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: id }))
    .query(({ ctx, input }) => ctx.services.products.list(input.projectId)),
  create: publicProcedure
    .input(ProductInputSchema)
    .mutation(({ ctx, input }) => ctx.services.products.create(input)),
  update: publicProcedure
    .input(z.object({ id, version, patch: ProductInputSchema.omit({ projectId: true }).partial() }))
    .mutation(({ ctx, input }) =>
      ctx.services.products.update(input.id, input.patch, input.version),
    ),
  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.products.remove(input.id)),
});

export const foldersRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: id }))
    .query(({ ctx, input }) => ctx.services.folders.list(input.projectId)),
  create: publicProcedure
    .input(FolderInputSchema)
    .mutation(({ ctx, input }) => ctx.services.folders.create(input)),
  rename: publicProcedure
    .input(z.object({ id, name: z.string(), version }))
    .mutation(({ ctx, input }) => ctx.services.folders.rename(input.id, input.name, input.version)),
  move: publicProcedure
    .input(
      z.object({
        id,
        parentId: id.nullable(),
        sortOrder: z.number().int().optional(),
        productId: id.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.folders.move(input.id, input.parentId, input.sortOrder, input.productId),
    ),
  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.folders.remove(input.id)),
});

export const testCasesRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: id, folderId: id.nullable().optional() }))
    .query(({ ctx, input }) => ctx.services.testCases.list(input.projectId, input.folderId)),
  get: publicProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => ctx.services.testCases.get(input.id)),
  create: publicProcedure
    .input(NewTestCaseSchema)
    .mutation(({ ctx, input }) => ctx.services.testCases.create(input)),
  /** Saves the whole document (validated / migrated by `@kiemi/schema`). */
  save: publicProcedure
    .input(z.object({ id, version, content: z.unknown() }))
    .mutation(({ ctx, input }) =>
      ctx.services.testCases.save(input.id, input.content, input.version),
    ),
  rename: publicProcedure
    .input(z.object({ id, name: z.string(), version }))
    .mutation(({ ctx, input }) =>
      ctx.services.testCases.rename(input.id, input.name, input.version),
    ),
  move: publicProcedure
    .input(z.object({ id, folderId: id.nullable(), productId: id.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.testCases.move(input.id, input.folderId, input.productId),
    ),
  duplicate: publicProcedure
    .input(z.object({ id, name: z.string().optional() }))
    .mutation(({ ctx, input }) => ctx.services.testCases.duplicate(input.id, input.name)),
  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.testCases.remove(input.id)),
  restore: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.testCases.repo.restore(input.id)),
});

export const suitesRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: id }))
    .query(({ ctx, input }) => ctx.services.suites.list(input.projectId)),
  get: publicProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => ctx.services.suites.get(input.id)),
  create: publicProcedure
    .input(SuiteInputSchema)
    .mutation(({ ctx, input }) => ctx.services.suites.create(input)),
  update: publicProcedure
    .input(z.object({ id, version, patch: SuiteInputSchema.omit({ projectId: true }).partial() }))
    .mutation(({ ctx, input }) => ctx.services.suites.update(input.id, input.patch, input.version)),
  setItems: publicProcedure
    .input(z.object({ id, items: z.array(SuiteItemInputSchema) }))
    .mutation(({ ctx, input }) => ctx.services.suites.setItems(input.id, input.items)),
  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.suites.remove(input.id)),
});

export const sharedStepsRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: id }))
    .query(({ ctx, input }) => ctx.services.sharedSteps.list(input.projectId)),
  get: publicProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => ctx.services.sharedSteps.get(input.id)),
  create: publicProcedure
    .input(SharedStepInputSchema)
    .mutation(({ ctx, input }) => ctx.services.sharedSteps.create(input)),
  update: publicProcedure
    .input(
      z.object({ id, version, patch: SharedStepInputSchema.omit({ projectId: true }).partial() }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.sharedSteps.update(input.id, input.patch, input.version),
    ),
  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.sharedSteps.remove(input.id)),
});

export const elementsRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: id, productId: id.optional() }))
    .query(({ ctx, input }) => ctx.services.elements.list(input.projectId, input.productId)),
  create: publicProcedure
    .input(ElementInputSchema)
    .mutation(({ ctx, input }) => ctx.services.elements.create(input)),
  update: publicProcedure
    .input(
      z.object({
        id,
        version,
        patch: ElementInputSchema.omit({ projectId: true, productId: true }).partial(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.elements.update(input.id, input.patch, input.version),
    ),
  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.elements.remove(input.id)),
});

/** Environments, variables and secrets [S-06, E-08]. Secret values never go back to the renderer. */
export const environmentsRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: id }))
    .query(({ ctx, input }) => ctx.services.environments.list(input.projectId)),
  get: publicProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => ctx.services.environments.get(input.id)),
  create: publicProcedure
    .input(EnvironmentInputSchema)
    .mutation(({ ctx, input }) => ctx.services.environments.create(input)),
  update: publicProcedure
    .input(
      z.object({ id, version, patch: EnvironmentInputSchema.omit({ projectId: true }).partial() }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.environments.update(input.id, input.patch, input.version),
    ),
  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.environments.remove(input.id)),
  setVariables: publicProcedure
    .input(z.object({ id, variables: z.record(z.string(), z.string()) }))
    .mutation(({ ctx, input }) =>
      ctx.services.environments.setVariables(input.id, input.variables),
    ),
  setSecret: publicProcedure
    .input(z.object({ id, name: z.string(), value: z.string().max(10_000) }))
    .mutation(({ ctx, input }) =>
      ctx.services.environments.setSecret(input.id, input.name, input.value),
    ),
  removeSecret: publicProcedure
    .input(z.object({ id, name: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.environments.removeSecret(input.id, input.name)),
});

/** Test data [E-03]. */
export const datasetsRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: id }))
    .query(({ ctx, input }) => ctx.services.datasets.list(input.projectId)),
  get: publicProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => ctx.services.datasets.get(input.id)),
  create: publicProcedure
    .input(DatasetInputSchema)
    .mutation(({ ctx, input }) => ctx.services.datasets.create(input)),
  update: publicProcedure
    .input(
      z.object({
        id,
        version,
        patch: z.object({
          name: z.string().optional(),
          columns: z.array(z.string()).optional(),
          rows: z.array(z.record(z.string(), z.string())).optional(),
        }),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.datasets.update(input.id, input.patch, input.version),
    ),
  remove: publicProcedure
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => ctx.services.datasets.remove(input.id)),
  excelSheets: publicProcedure
    .input(z.object({ data: base64 }))
    .query(({ input }) => excelSheets(bytes(input.data))),
  importFile: publicProcedure
    .input(
      z.object({
        projectId: id,
        name: z.string(),
        fileName: z.string(),
        data: base64,
        sheet: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      /\.xlsx$/i.test(input.fileName)
        ? ctx.services.datasets.importExcel(
            input.projectId,
            input.name,
            input.fileName,
            bytes(input.data),
            input.sheet,
          )
        : ctx.services.datasets.importCsv(
            input.projectId,
            input.name,
            input.fileName,
            bytes(input.data),
          ),
    ),
});

/** Export / import tests, suites, projects [J-03]. */
export const ioRouter = router({
  exportTest: publicProcedure
    .input(z.object({ id }))
    .query(({ ctx, input }) => exportTestCase(ctx.services, input.id)),
  importTest: publicProcedure
    .input(
      z.object({ projectId: id, folderId: id.nullable(), text: z.string().max(20 * 1024 * 1024) }),
    )
    .mutation(({ ctx, input }) =>
      importTestCase(ctx.services, input.projectId, input.folderId, input.text),
    ),
  exportBundle: publicProcedure
    .input(z.union([z.object({ projectId: id }), z.object({ suiteId: id })]))
    .query(({ ctx, input }) => {
      const out = exportBundle(ctx.services, input);
      return { fileName: out.fileName, data: Buffer.from(out.data).toString('base64') };
    }),
  importBundle: publicProcedure
    .input(z.object({ data: base64, projectName: z.string().trim().min(1).optional() }))
    .mutation(({ ctx, input }) =>
      importBundle(
        ctx.services,
        bytes(input.data),
        input.projectName === undefined ? {} : { projectName: input.projectName },
      ),
    ),
});

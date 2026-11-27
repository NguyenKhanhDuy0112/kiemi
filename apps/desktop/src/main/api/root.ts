import { appRouter } from './routers/app';
import { coverageRouter } from './routers/coverage';
import { dashboardRouter } from './routers/dashboard';
import {
  datasetsRouter,
  elementsRouter,
  environmentsRouter,
  foldersRouter,
  ioRouter,
  productsRouter,
  projectsRouter,
  sharedStepsRouter,
  suitesRouter,
  testCasesRouter,
} from './routers/data';
import { dbQueryRouter } from './routers/db-query';
import { formulasRouter } from './routers/formulas';
import { issuesRouter } from './routers/issues';
import { manualRouter } from './routers/manual';
import { notifyRouter } from './routers/notify';
import { permissionsRouter } from './routers/permissions';
import { formsRouter, recorderRouter, savedLoginsRouter } from './routers/recorder';
import { reportsRouter } from './routers/reports';
import { runsRouter } from './routers/runs';
import { samplesRouter } from './routers/samples';
import { searchRouter } from './routers/search';
import { sharedResourcesRouter } from './routers/shared-resources';
import { systemRouter } from './routers/system';
import { updatesRouter } from './routers/updates';
import { createCallerFactory, router } from './trpc';

export const rootRouter = router({
  app: appRouter,
  system: systemRouter,
  samples: samplesRouter,
  projects: projectsRouter,
  products: productsRouter,
  folders: foldersRouter,
  testCases: testCasesRouter,
  suites: suitesRouter,
  sharedSteps: sharedStepsRouter,
  elements: elementsRouter,
  environments: environmentsRouter,
  datasets: datasetsRouter,
  io: ioRouter,
  runs: runsRouter,
  recorder: recorderRouter,
  forms: formsRouter,
  coverage: coverageRouter,
  dashboard: dashboardRouter,
  issues: issuesRouter,
  formulas: formulasRouter,
  manual: manualRouter,
  permissions: permissionsRouter,
  reports: reportsRouter,
  notify: notifyRouter,
  dbQuery: dbQueryRouter,
  savedLogins: savedLoginsRouter,
  updates: updatesRouter,
  sharedResources: sharedResourcesRouter,
  search: searchRouter,
});

export type AppRouter = typeof rootRouter;

export const createCaller = createCallerFactory(rootRouter);

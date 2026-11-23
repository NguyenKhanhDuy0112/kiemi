import { appRouter } from './routers/app';
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
import { recorderRouter, savedLoginsRouter } from './routers/recorder';
import { runsRouter } from './routers/runs';
import { samplesRouter } from './routers/samples';
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
  savedLogins: savedLoginsRouter,
  updates: updatesRouter,
});

export type AppRouter = typeof rootRouter;

export const createCaller = createCallerFactory(rootRouter);

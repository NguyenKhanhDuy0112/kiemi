import type { Services } from '@kiemi/db';
import { DbError } from '@kiemi/db';
import { initTRPC, TRPCError } from '@trpc/server';
import type { ProjectFolderManager } from '../projects/folder-manager';
import type { RecorderManager } from '../record/recorder-manager';
import type { RunManager } from '../run/run-manager';
import type { UpdateService } from '../update/update-service';

/** Per-request context supplied by the main process. Must stay free of Electron imports. */
export interface ApiContext {
  appVersion: string;
  platform: string;
  /** Data services of the current workspace. */
  services: Services;
  /** Project created on first start (default selection in the UI). */
  defaultProjectId: string;
  /** Starts runs in the engine utility process [M4-01]. */
  runs: RunManager;
  /** Recording and Pick / Highlight sessions [M5] (absent in some tests). */
  recorder?: RecorderManager;
  /** OS / window features (absent in tests). */
  desktop?: DesktopBridge;
  /** Address of the bundled sample site, started on demand [L-01]. */
  sampleSiteUrl?: () => Promise<string>;
  /** Opt-in crash reports [N-09] (absent in tests). */
  crashReports?: CrashReporter;
  /** Automatic updates (absent in development and tests) [N-12]. */
  updates?: UpdateService;
  /** Project folders on disk, synced after every mutation [T-01] (absent in most tests). */
  projectFolders?: ProjectFolderManager;
}

export interface CrashReporter {
  setEnabled(enabled: boolean): void;
  reportRendererError(error: { message: string; stack?: string | undefined }): void;
}

export interface DesktopBridge {
  /** Opens Playwright's trace viewer for a trace file [I-03]. */
  openTrace(file: string): Promise<void>;
  /** Shows a file or folder in Finder / Explorer. */
  showInFolder(path: string): void;
  /** Opens an https link in the OS browser. */
  openExternal(url: string): void;
  /** Opens a folder in Finder / Explorer. */
  openFolder(path: string): void;
  /** Native "choose a folder" dialog; `undefined` when cancelled. */
  pickFolder(title: string): Promise<string | undefined>;
}

const DB_TO_TRPC = {
  NOT_FOUND: 'NOT_FOUND',
  VERSION_CONFLICT: 'CONFLICT',
  VALIDATION: 'BAD_REQUEST',
  NAME_TAKEN: 'CONFLICT',
  SECRETS_UNAVAILABLE: 'PRECONDITION_FAILED',
  IMPORT_FAILED: 'BAD_REQUEST',
  FOLDER_INVALID: 'BAD_REQUEST',
  PROJECT_ALREADY_OPEN: 'CONFLICT',
  CONFIRM_REQUIRED: 'PRECONDITION_FAILED',
} as const;

const t = initTRPC.context<ApiContext>().create({
  isServer: true,
  // The renderer translates `data.kiemiCode` + `data.details` into plain Vietnamese.
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    return {
      ...shape,
      data: {
        ...shape.data,
        ...(cause instanceof DbError
          ? { kiemiCode: cause.code, details: cause.details ?? null }
          : {}),
      },
    };
  },
});

/** Converts data-layer errors into tRPC errors (code + original cause). */
const dbErrors = t.middleware(async ({ next }) => {
  const res = await next();
  if (!res.ok && res.error.cause instanceof DbError) {
    const cause = res.error.cause;
    throw new TRPCError({ code: DB_TO_TRPC[cause.code], message: cause.message, cause });
  }
  return res;
});

/** Every successful mutation may have changed project data: write the folders soon [T-01]. */
const NO_FOLDER_SYNC = new Set(['projects.touchLock', 'projects.releaseLock']);
const folderSync = t.middleware(async ({ ctx, type, path, next }) => {
  const res = await next();
  if (res.ok && type === 'mutation' && !NO_FOLDER_SYNC.has(path)) ctx.projectFolders?.changed();
  return res;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(dbErrors).use(folderSync);
export const createCallerFactory = t.createCallerFactory;

import type { ArtifactRef, RunError, RunResult, StepResult } from '@kiemi/schema';
import { eq } from 'drizzle-orm';
import { Repo, type RepoContext } from '../repo';
import { artifacts, type RunTarget, runCases, runSteps, runs } from '../tables';

export type RunRowStatus = (typeof runs.$inferSelect)['status'];

export interface NewRunInput {
  projectId: string;
  environmentId?: string | null;
  suiteId?: string | null;
  artifactDir: string;
  trigger?: 'manual' | 'schedule' | 'cli';
  target?: RunTarget | null;
}

export interface StepRecord {
  runCaseId: string;
  result: StepResult;
  phase: 'steps' | 'cleanup';
  stepNo: string;
  session: string;
  parentStepId?: string | undefined;
}

/** Plain error kept in run tables (the UI translates `code`). */
function storedError(error: RunError | undefined) {
  if (!error) return null;
  return {
    code: error.code,
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

/**
 * Runs, their test cases (one per dataset row) and step results [M4-01].
 * Written by the main process while the engine streams events.
 */
export class RunService {
  readonly repo: Repo<typeof runs>;
  readonly cases: Repo<typeof runCases>;
  readonly steps: Repo<typeof runSteps>;
  readonly artifacts: Repo<typeof artifacts>;
  readonly #ctx: RepoContext;

  constructor(ctx: RepoContext) {
    this.#ctx = ctx;
    this.repo = new Repo(ctx, runs, 'run');
    this.cases = new Repo(ctx, runCases, 'run case');
    this.steps = new Repo(ctx, runSteps, 'run step');
    this.artifacts = new Repo(ctx, artifacts, 'artifact');
  }

  #now(): Date {
    return this.#ctx.now?.() ?? new Date();
  }

  create(input: NewRunInput & { id?: string }) {
    return this.repo.create({
      ...(input.id ? { id: input.id } : {}),
      projectId: input.projectId,
      environmentId: input.environmentId ?? null,
      suiteId: input.suiteId ?? null,
      status: 'queued',
      trigger: input.trigger ?? 'manual',
      artifactDir: input.artifactDir,
      target: input.target ?? null,
    });
  }

  get(id: string) {
    return this.repo.get(id);
  }

  list(projectId: string) {
    return this.repo.list(eq(runs.projectId, projectId), runs.createdAt);
  }

  markRunning(id: string) {
    return this.repo.update(id, { status: 'running', startedAt: this.#now() });
  }

  /** Final status; duration is measured from `startedAt`. */
  finish(id: string, status: Exclude<RunRowStatus, 'queued' | 'running'>) {
    const run = this.repo.get(id);
    const finishedAt = this.#now();
    const started = run.startedAt ?? run.createdAt;
    return this.repo.update(id, {
      status,
      finishedAt,
      durationMs: Math.max(0, finishedAt.getTime() - started.getTime()),
    });
  }

  addCase(input: { runId: string; testCaseId: string; rowIndex?: number | undefined }) {
    return this.cases.create({
      runId: input.runId,
      testCaseId: input.testCaseId,
      rowIndex: input.rowIndex ?? null,
      status: 'queued',
    });
  }

  listCases(runId: string) {
    return this.cases.list(eq(runCases.runId, runId));
  }

  startCase(id: string) {
    return this.cases.update(id, { status: 'running', startedAt: this.#now() });
  }

  /** Stores the engine's final result of one test case (+ its run-level artifacts). */
  finishCase(
    id: string,
    result: Pick<RunResult, 'status' | 'durationMs' | 'error'> &
      Partial<Pick<RunResult, 'observations'>>,
  ) {
    return this.cases.update(id, {
      observations:
        result.observations && Object.keys(result.observations).length ? result.observations : null,
      status: result.status,
      durationMs: Math.round(result.durationMs),
      error: storedError(result.error),
    });
  }

  /** Marks a case that never finished (engine crash, cancelled, skipped after a failure). */
  abortCase(id: string, status: 'error' | 'cancelled' | 'skipped', error?: RunError) {
    return this.cases.update(id, { status, error: storedError(error) });
  }

  recordStep(rec: StepRecord) {
    const row = this.steps.create({
      runCaseId: rec.runCaseId,
      stepId: rec.result.stepId,
      parentStepId: rec.parentStepId ?? null,
      phase: rec.phase,
      stepNo: rec.stepNo,
      session: rec.session,
      status: rec.result.status,
      soft: rec.result.soft,
      startedAt: new Date(rec.result.startedAt),
      durationMs: Math.round(rec.result.durationMs),
      error: storedError(rec.result.error),
    });
    return row;
  }

  listSteps(runCaseId: string) {
    return this.steps.list(eq(runSteps.runCaseId, runCaseId));
  }

  addArtifact(input: {
    runId: string;
    runCaseId?: string | undefined;
    runStepId?: string | undefined;
    artifact: ArtifactRef;
  }) {
    return this.artifacts.create({
      runId: input.runId,
      runCaseId: input.runCaseId ?? null,
      runStepId: input.runStepId ?? null,
      kind: input.artifact.kind,
      path: input.artifact.path,
    });
  }

  listArtifacts(runId: string) {
    return this.artifacts.list(eq(artifacts.runId, runId));
  }

  /** Run with every case, its steps and files — for the result screen [S-04]. */
  detail(runId: string) {
    const run = this.repo.get(runId);
    const files = this.listArtifacts(runId);
    return {
      ...run,
      cases: this.listCases(runId).map((c) => ({
        ...c,
        steps: this.listSteps(c.id).map((st) => ({
          ...st,
          artifacts: files.filter((f) => f.runStepId === st.id),
        })),
        artifacts: files.filter((f) => f.runCaseId === c.id && f.runStepId === null),
      })),
    };
  }

  /**
   * Run history, newest first, with per-run case counts [S-05].
   * Filters: a test (any case of it), a suite, a status.
   */
  history(
    projectId: string,
    filter: {
      testCaseId?: string | undefined;
      suiteId?: string | undefined;
      status?: RunRowStatus | undefined;
      limit?: number | undefined;
    } = {},
  ) {
    // UUIDv7 ids sort by creation time (monotonic within a millisecond).
    const all = this.list(projectId).sort((x, y) => (x.id < y.id ? 1 : -1));
    const out = [];
    for (const run of all) {
      if (filter.suiteId && run.suiteId !== filter.suiteId) continue;
      if (filter.status && run.status !== filter.status) continue;
      const cases = this.listCases(run.id);
      if (filter.testCaseId && !cases.some((c) => c.testCaseId === filter.testCaseId)) continue;
      const count = (st: string) => cases.filter((c) => c.status === st).length;
      out.push({
        ...run,
        testCaseIds: [...new Set(cases.map((c) => c.testCaseId))],
        counts: {
          total: cases.length,
          passed: count('passed'),
          failed: count('failed'),
          error: count('error'),
          cancelled: count('cancelled'),
          skipped: count('skipped'),
        },
      });
      if (filter.limit && out.length >= filter.limit) break;
    }
    return out;
  }
}

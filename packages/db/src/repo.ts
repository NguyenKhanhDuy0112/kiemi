import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { v7 as uuidv7 } from 'uuid';
import type { KiemiDb } from './database';
import type { ALL_TABLES } from './tables';

/** Stable error codes; the UI turns them into plain-language messages. */
export const DB_ERROR_CODES = [
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'VALIDATION',
  'NAME_TAKEN',
  'SECRETS_UNAVAILABLE',
  'IMPORT_FAILED',
  'FOLDER_INVALID',
  'PROJECT_ALREADY_OPEN',
] as const;
/** Data-layer error codes; the UI shows `ui.dbErrors.<code>` for each. */
export type DbErrorCode = (typeof DB_ERROR_CODES)[number];

export class DbError extends Error {
  readonly code: DbErrorCode;
  readonly details: Record<string, unknown> | undefined;
  constructor(code: DbErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DbError';
    this.code = code;
    this.details = details;
  }
}

export interface RepoContext {
  db: KiemiDb;
  workspaceId: string;
  now?: () => Date;
}

export const newId = (): string => uuidv7();

/** Partial update where `undefined` means "leave unchanged". */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

type Table = (typeof ALL_TABLES)[keyof typeof ALL_TABLES];
type BaseCols = 'id' | 'workspaceId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version';

/**
 * CRUD for one table, scoped to a workspace, with soft delete and optimistic
 * versioning (`version` must match on update, then increments) — CLAUDE.md §5.6.
 */
export class Repo<T extends Table> {
  readonly #ctx: RepoContext;
  readonly #table: T;
  readonly #entity: string;

  constructor(ctx: RepoContext, table: T, entity: string) {
    this.#ctx = ctx;
    this.#table = table;
    this.#entity = entity;
  }

  get #cols(): Record<BaseCols, SQLiteColumn> {
    return this.#table as unknown as Record<BaseCols, SQLiteColumn>;
  }

  #now(): Date {
    return this.#ctx.now?.() ?? new Date();
  }

  #scope(filter?: SQL, includeDeleted = false): SQL | undefined {
    const c = this.#cols;
    return and(
      eq(c.workspaceId, this.#ctx.workspaceId),
      includeDeleted ? undefined : isNull(c.deletedAt),
      filter,
    );
  }

  list(filter?: SQL, order?: SQLiteColumn): T['$inferSelect'][] {
    const q = this.#ctx.db
      .select()
      .from(this.#table as Table)
      .where(this.#scope(filter));
    return (
      order ? q.orderBy(asc(order)) : q.orderBy(asc(this.#cols.createdAt))
    ).all() as T['$inferSelect'][];
  }

  find(id: string, includeDeleted = false): T['$inferSelect'] | undefined {
    return this.#ctx.db
      .select()
      .from(this.#table as Table)
      .where(this.#scope(eq(this.#cols.id, id), includeDeleted))
      .get() as T['$inferSelect'] | undefined;
  }

  get(id: string): T['$inferSelect'] {
    const row = this.find(id);
    if (!row)
      throw new DbError('NOT_FOUND', `${this.#entity} ${id} not found`, {
        entity: this.#entity,
        id,
      });
    return row;
  }

  create(values: Omit<T['$inferInsert'], BaseCols> & { id?: string }): T['$inferSelect'] {
    const now = this.#now();
    const row = {
      ...values,
      id: values.id ?? newId(),
      workspaceId: this.#ctx.workspaceId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    };
    this.#ctx.db
      .insert(this.#table as Table)
      .values(row as never)
      .run();
    return this.get(row.id);
  }

  /** Updates fields; with `expectedVersion`, fails if someone saved in between. */
  update(
    id: string,
    patch: {
      [K in keyof Omit<T['$inferInsert'], BaseCols>]?:
        | Omit<T['$inferInsert'], BaseCols>[K]
        | undefined;
    },
    expectedVersion?: number,
  ): T['$inferSelect'] {
    const current = this.get(id) as { version: number };
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new DbError('VERSION_CONFLICT', `${this.#entity} ${id} was changed elsewhere`, {
        entity: this.#entity,
        id,
        expected: expectedVersion,
        actual: current.version,
      });
    }
    this.#ctx.db
      .update(this.#table as Table)
      .set({ ...defined(patch), updatedAt: this.#now(), version: current.version + 1 } as never)
      .where(eq(this.#cols.id, id))
      .run();
    return this.get(id);
  }

  /** Soft delete (kept for undo / sync). */
  remove(id: string): void {
    const current = this.get(id) as { version: number };
    const now = this.#now();
    this.#ctx.db
      .update(this.#table as Table)
      .set({ deletedAt: now, updatedAt: now, version: current.version + 1 } as never)
      .where(eq(this.#cols.id, id))
      .run();
  }

  restore(id: string): T['$inferSelect'] {
    const row = this.find(id, true) as { version: number; deletedAt: Date | null } | undefined;
    if (!row)
      throw new DbError('NOT_FOUND', `${this.#entity} ${id} not found`, {
        entity: this.#entity,
        id,
      });
    this.#ctx.db
      .update(this.#table as Table)
      .set({ deletedAt: null, updatedAt: this.#now(), version: row.version + 1 } as never)
      .where(eq(this.#cols.id, id))
      .run();
    return this.get(id);
  }
}

/** Throws VALIDATION with the Zod issues. */
export function validation(
  entity: string,
  issues: { path: PropertyKey[]; message: string }[],
): DbError {
  return new DbError('VALIDATION', `Invalid ${entity}`, {
    entity,
    issues: issues.map((i) => ({ path: i.path.map(String), message: i.message })),
  });
}

/** Drops keys whose value is `undefined` (= "not changed"). */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

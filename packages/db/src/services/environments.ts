import {
  type AppCell,
  type Env,
  EnvColorSchema,
  EnvSchema,
  EnvTypeSchema,
  guessEnvType,
  ProxySchema,
  type Secrets,
  SshSettingsSchema,
  VariableNameSchema,
} from '@kiemi/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DbError, type Patch, Repo, type RepoContext, validation } from '../repo';
import { environmentProducts, environments, products, secrets, variables } from '../tables';
import { ProductService } from './products';

/**
 * Encrypts secrets with the OS keychain. Desktop passes Electron `safeStorage`;
 * tests pass a fake. Plain values never touch the database [N-07, E-08].
 */
export interface SecretCipher {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

export const EnvironmentInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  /** [O-03] Production turns `protected` on unless it is given. */
  type: EnvTypeSchema.optional(),
  color: EnvColorSchema.nullish(),
  /** [W-10] */
  protected: z.boolean().optional(),
  /**
   * Shortcuts for the DEFAULT product's cell (v1.0 callers: samples, bundles):
   * written into `environment_products`, not into the environment row [O-02].
   */
  baseUrl: z.url().nullish(),
  proxy: ProxySchema.nullish(),
  /** SSH tunnel [G-07]. */
  ssh: SshSettingsSchema.nullish(),
});

/** A cell of the Environment × Product matrix [O-02]. */
export const CellInputSchema = z.object({
  url: z.url().nullish(),
  variables: z.record(VariableNameSchema, z.string()).default({}),
  proxy: ProxySchema.nullish(),
  ssh: SshSettingsSchema.nullish(),
});
export type CellInput = z.input<typeof CellInputSchema>;
export type CellRow = typeof environmentProducts.$inferSelect;

/** What the UI may see about a secret: never the value. */
export interface SecretInfo {
  id: string;
  name: string;
  updatedAt: Date;
}

/** Environments (UAT, Staging…) with base URL, variables and secrets [S-06]. */
export class EnvironmentService {
  readonly repo: Repo<typeof environments>;
  readonly vars: Repo<typeof variables>;
  readonly secrets: Repo<typeof secrets>;
  readonly cellRepo: Repo<typeof environmentProducts>;
  readonly #ctx: RepoContext;
  readonly #cipher: SecretCipher;
  readonly #products: ProductService;

  constructor(ctx: RepoContext, cipher: SecretCipher) {
    this.#ctx = ctx;
    this.#cipher = cipher;
    this.repo = new Repo(ctx, environments, 'environment');
    this.vars = new Repo(ctx, variables, 'variable');
    this.secrets = new Repo(ctx, secrets, 'secret');
    this.cellRepo = new Repo(ctx, environmentProducts, 'environment cell');
    this.#products = new ProductService(ctx);
  }

  list(projectId: string) {
    return this.repo.list(eq(environments.projectId, projectId), environments.sortOrder);
  }

  /**
   * Environment with its variables, the names of its secrets, its cells, and
   * the default product's cell as `baseUrl/proxy/ssh` (v1.0 shape).
   */
  get(id: string) {
    const row = this.repo.get(id);
    const def = this.#defaultCell(row.projectId, id);
    return {
      ...row,
      baseUrl: def?.url ?? null,
      proxy: def?.proxy ?? null,
      ssh: def?.ssh ?? null,
      variables: this.variables(id),
      secrets: this.listSecrets(id),
      cells: this.cells(id),
    };
  }

  create(input: z.input<typeof EnvironmentInputSchema>) {
    const p = EnvironmentInputSchema.safeParse(input);
    if (!p.success) throw validation('environment', p.error.issues);
    this.#uniqueName(p.data.projectId, p.data.name);
    return this.#ctx.db.transaction(() => {
      const type = p.data.type ?? guessEnvType(p.data.name);
      const row = this.repo.create({
        projectId: p.data.projectId,
        name: p.data.name,
        type,
        color: p.data.color ?? null,
        protected: p.data.protected ?? type === 'production',
        sortOrder: this.list(p.data.projectId).length,
      });
      const { baseUrl, proxy, ssh } = p.data;
      if (baseUrl || proxy || ssh) {
        const product = this.#products.defaultFor(p.data.projectId);
        this.setCell(row.id, product.id, { url: baseUrl ?? null, proxy, ssh });
      }
      return this.repo.get(row.id);
    });
  }

  update(
    id: string,
    input: Patch<Omit<z.input<typeof EnvironmentInputSchema>, 'projectId'>>,
    expectedVersion?: number,
  ) {
    const p = EnvironmentInputSchema.omit({ projectId: true }).partial().safeParse(input);
    if (!p.success) throw validation('environment', p.error.issues);
    const env = this.repo.get(id);
    if (p.data.name !== undefined && p.data.name !== env.name) {
      this.#uniqueName(env.projectId, p.data.name);
    }
    const { baseUrl, proxy, ssh, ...own } = p.data;
    // Switching to Production protects it unless the caller says otherwise [W-10].
    if (own.type === 'production' && env.type !== 'production' && own.protected === undefined)
      own.protected = true;
    return this.#ctx.db.transaction(() => {
      if (baseUrl !== undefined || proxy !== undefined || ssh !== undefined) {
        const product = this.#products.defaultFor(env.projectId);
        const cur = this.cell(id, product.id);
        this.setCell(id, product.id, {
          url: baseUrl === undefined ? cur?.url : baseUrl,
          variables: cur?.variables ?? {},
          proxy: proxy === undefined ? cur?.proxy : proxy,
          ssh: ssh === undefined ? cur?.ssh : ssh,
        });
      }
      return Object.keys(own).length || expectedVersion !== undefined
        ? this.repo.update(id, own, expectedVersion)
        : this.repo.get(id);
    });
  }

  remove(id: string) {
    this.#ctx.db.transaction(() => {
      for (const v of this.vars.list(eq(variables.environmentId, id))) this.vars.remove(v.id);
      for (const s of this.secrets.list(eq(secrets.environmentId, id))) this.secrets.remove(s.id);
      for (const c of this.cells(id)) this.cellRepo.remove(c.id);
      this.repo.remove(id);
    });
  }

  // ── Environment × Product matrix [O-02] ────────────────────────────────

  /** Cells of one environment. */
  cells(environmentId: string): CellRow[] {
    return this.cellRepo.list(eq(environmentProducts.environmentId, environmentId));
  }

  /** Every cell of the project (the matrix screen). */
  matrix(projectId: string): CellRow[] {
    return this.cellRepo.list(eq(environmentProducts.projectId, projectId));
  }

  cell(environmentId: string, productId: string): CellRow | undefined {
    return this.cellRepo.list(
      and(
        eq(environmentProducts.environmentId, environmentId),
        eq(environmentProducts.productId, productId),
      ),
    )[0];
  }

  /**
   * Creates/updates the cell (environment, product); `null` removes it (the
   * product is then not available in that environment) [O-02].
   */
  setCell(environmentId: string, productId: string, input: CellInput | null): CellRow | null {
    const env = this.repo.get(environmentId);
    const product = this.#products.get(productId);
    if (product.projectId !== env.projectId)
      throw new DbError('VALIDATION', 'Product of another project', { entity: 'product' });
    const cur = this.cell(environmentId, productId);
    if (input === null) {
      if (cur) this.cellRepo.remove(cur.id);
      return null;
    }
    const p = CellInputSchema.safeParse(input);
    if (!p.success) throw validation('environment cell', p.error.issues);
    const values = {
      url: p.data.url ?? null,
      variables: p.data.variables,
      proxy: p.data.proxy ?? null,
      ssh: p.data.ssh ?? null,
    };
    if (!cur)
      return this.cellRepo.create({
        projectId: env.projectId,
        environmentId,
        productId,
        ...values,
      });
    const same = (Object.keys(values) as (keyof typeof values)[]).every(
      (k) => JSON.stringify(cur[k] ?? null) === JSON.stringify(values[k] ?? null),
    );
    return same ? cur : this.cellRepo.update(cur.id, values);
  }

  /** Replaces every cell of the environment (folder sync) — keyed by product. */
  setCells(environmentId: string, cells: (CellInput & { productId: string })[]): void {
    this.#ctx.db.transaction(() => {
      const keep = new Set<string>();
      for (const { productId, ...c } of cells) {
        keep.add(productId);
        this.setCell(environmentId, productId, c);
      }
      for (const c of this.cells(environmentId))
        if (!keep.has(c.productId)) this.cellRepo.remove(c.id);
    });
  }

  /**
   * "Nhân bản môi trường": copies variables, secret NAMES (values stay — the
   * tester types them for the new environment) and every cell [O-02].
   */
  duplicate(environmentId: string, name: string) {
    const src = this.repo.get(environmentId);
    return this.#ctx.db.transaction(() => {
      const copy = this.create({
        projectId: src.projectId,
        name,
        type: src.type,
        color: src.color,
        protected: src.protected,
      });
      this.setVariables(copy.id, this.variables(environmentId));
      this.setSecretNames(copy.id, this.secretNames(environmentId));
      for (const c of this.cells(environmentId))
        this.setCell(copy.id, c.productId, {
          url: c.url,
          variables: c.variables,
          proxy: c.proxy,
          ssh: c.ssh,
        });
      return this.repo.get(copy.id);
    });
  }

  /**
   * Startup data migration (no version bump): each v1.0 environment's
   * `baseUrl/proxy/ssh` become the cell (environment, default product) [O-02, ADR 0018 §5].
   */
  backfillCells(): void {
    const pending = this.repo.list(eq(environments.cellsPending, 1));
    for (const e of pending) {
      this.#ctx.db.transaction(() => {
        const product = this.#products.defaultFor(e.projectId);
        if (!this.cell(e.id, product.id))
          this.setCell(e.id, product.id, { url: e.baseUrl, proxy: e.proxy, ssh: e.ssh });
        this.repo.update(e.id, { cellsPending: 0, baseUrl: null, proxy: null, ssh: null });
      });
    }
  }

  #defaultCell(projectId: string, environmentId: string): CellRow | undefined {
    const first = this.#products.repo.list(
      eq(products.projectId, projectId),
      products.sortOrder,
    )[0];
    return first ? this.cell(environmentId, first.id) : undefined;
  }

  variables(environmentId: string): Record<string, string> {
    return Object.fromEntries(
      this.vars
        .list(eq(variables.environmentId, environmentId), variables.name)
        .map((v) => [v.name, v.value]),
    );
  }

  /** Replaces all variables of the environment [E-02]. */
  setVariables(environmentId: string, values: Record<string, string>) {
    this.repo.get(environmentId);
    const p = z.record(VariableNameSchema, z.string()).safeParse(values);
    if (!p.success) throw validation('variable', p.error.issues);
    this.#ctx.db.transaction(() => {
      const existing = new Map(
        this.vars.list(eq(variables.environmentId, environmentId)).map((v) => [v.name, v]),
      );
      for (const [name, value] of Object.entries(p.data)) {
        const cur = existing.get(name);
        if (!cur) this.vars.create({ environmentId, name, value });
        else if (cur.value !== value) this.vars.update(cur.id, { value });
        existing.delete(name);
      }
      for (const left of existing.values()) this.vars.remove(left.id);
    });
    return this.variables(environmentId);
  }

  listSecrets(environmentId: string): SecretInfo[] {
    return this.secrets
      .list(eq(secrets.environmentId, environmentId), secrets.name)
      .map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt }));
  }

  /** Stores (or replaces) a secret value, encrypted [E-08, N-07]. */
  setSecret(environmentId: string, name: string, value: string): SecretInfo {
    this.repo.get(environmentId);
    const n = VariableNameSchema.safeParse(name);
    if (!n.success) throw validation('secret', n.error.issues);
    this.#requireCipher();
    const ciphertext = this.#cipher.encrypt(value);
    const cur = this.secrets.list(
      and(eq(secrets.environmentId, environmentId), eq(secrets.name, n.data)),
    )[0];
    const row = this.#ctx.db.transaction(() => {
      this.#expect(environmentId, n.data, true);
      return cur
        ? this.secrets.update(cur.id, { ciphertext })
        : this.secrets.create({ environmentId, name: n.data, ciphertext });
    });
    return { id: row.id, name: row.name, updatedAt: row.updatedAt };
  }

  removeSecret(environmentId: string, name: string): void {
    const cur = this.secrets.list(
      and(eq(secrets.environmentId, environmentId), eq(secrets.name, name)),
    )[0];
    if (!cur)
      throw new DbError('NOT_FOUND', `Secret ${name} not found`, { entity: 'secret', name });
    this.#ctx.db.transaction(() => {
      this.#expect(environmentId, name, false);
      this.secrets.remove(cur.id);
    });
  }

  /**
   * Names the environment expects (shared through the project folder), whether or
   * not this machine has a value [O-11].
   */
  secretNames(environmentId: string): string[] {
    const row = this.repo.get(environmentId);
    const names = new Set([
      ...(row.secretNames ?? []),
      ...this.listSecrets(environmentId).map((s) => s.name),
    ]);
    return [...names].sort();
  }

  /** Expected secrets with no value on this machine (project opened elsewhere) [O-11]. */
  missingSecrets(environmentId: string): string[] {
    const have = new Set(this.listSecrets(environmentId).map((s) => s.name));
    return this.secretNames(environmentId).filter((n) => !have.has(n));
  }

  /** Declares a secret name without a value (folder sync, bundle import). */
  setSecretNames(environmentId: string, names: string[]): void {
    const sorted = [...new Set(names)].sort();
    const row = this.repo.get(environmentId);
    if (JSON.stringify(row.secretNames ?? []) !== JSON.stringify(sorted))
      this.repo.update(environmentId, { secretNames: sorted });
  }

  #expect(environmentId: string, name: string, present: boolean): void {
    const row = this.repo.get(environmentId);
    const names = new Set(row.secretNames ?? []);
    if (names.has(name) === present) return;
    if (present) names.add(name);
    else names.delete(name);
    this.repo.update(environmentId, { secretNames: [...names].sort() });
  }

  /**
   * Engine input for a run: the environment and its decrypted secrets.
   * Main process only — never send the result to the renderer.
   */
  forRun(environmentId: string): { env: Env; secrets: Secrets } {
    const list = this.secrets.list(eq(secrets.environmentId, environmentId));
    if (list.length) this.#requireCipher();
    const plain: Secrets = Object.fromEntries(
      list.map((s) => [s.name, this.#cipher.decrypt(s.ciphertext)]),
    );
    return {
      env: { ...this.envOf(environmentId), secretNames: Object.keys(plain) },
      secrets: plain,
    };
  }

  /** Engine `Env` without decrypting anything (explanations, previews) [O-02, O-04]. */
  envOf(environmentId: string): Env {
    const row = this.repo.get(environmentId);
    const byProduct = new Map(this.cells(environmentId).map((c) => [c.productId, c]));
    const productList = this.#products.list(row.projectId);
    const apps: Record<string, AppCell> = {};
    for (const p of productList) {
      const c = byProduct.get(p.id);
      apps[p.key] = c
        ? {
            name: p.name,
            ...(c.url ? { url: c.url } : {}),
            variables: c.variables,
            ...(c.proxy ? { proxy: c.proxy } : {}),
            ...(c.ssh ? { ssh: c.ssh } : {}),
            missing: false,
          }
        : { name: p.name, variables: {}, missing: true };
    }
    const first = productList[0];
    const main = first ? apps[first.key] : undefined;
    const env = EnvSchema.parse({
      id: row.id,
      name: row.name,
      type: row.type,
      ...(row.color ? { color: row.color } : {}),
      protected: row.protected,
      ...(main?.url ? { baseUrl: main.url } : {}),
      apps,
      ...(first ? { defaultProduct: first.key } : {}),
      variables: this.variables(environmentId),
      secretNames: this.secretNames(environmentId),
    });
    return env;
  }

  #requireCipher(): void {
    if (!this.#cipher.isAvailable()) {
      throw new DbError(
        'SECRETS_UNAVAILABLE',
        'The OS keychain is not available to protect secrets',
        {},
      );
    }
  }

  #uniqueName(projectId: string, name: string): void {
    if (this.list(projectId).some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      throw new DbError('NAME_TAKEN', `Environment "${name}" already exists`, {
        entity: 'environment',
        name,
      });
    }
  }
}

import {
  type Env,
  EnvSchema,
  ProxySchema,
  type Secrets,
  SshSettingsSchema,
  VariableNameSchema,
} from '@kiemi/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DbError, type Patch, Repo, type RepoContext, validation } from '../repo';
import { environments, secrets, variables } from '../tables';

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
  baseUrl: z.url().nullish(),
  proxy: ProxySchema.nullish(),
  /** SSH tunnel [G-07]. */
  ssh: SshSettingsSchema.nullish(),
});

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
  readonly #ctx: RepoContext;
  readonly #cipher: SecretCipher;

  constructor(ctx: RepoContext, cipher: SecretCipher) {
    this.#ctx = ctx;
    this.#cipher = cipher;
    this.repo = new Repo(ctx, environments, 'environment');
    this.vars = new Repo(ctx, variables, 'variable');
    this.secrets = new Repo(ctx, secrets, 'secret');
  }

  list(projectId: string) {
    return this.repo.list(eq(environments.projectId, projectId), environments.sortOrder);
  }

  /** Environment with its variables and the names of its secrets. */
  get(id: string) {
    return { ...this.repo.get(id), variables: this.variables(id), secrets: this.listSecrets(id) };
  }

  create(input: z.input<typeof EnvironmentInputSchema>) {
    const p = EnvironmentInputSchema.safeParse(input);
    if (!p.success) throw validation('environment', p.error.issues);
    this.#uniqueName(p.data.projectId, p.data.name);
    return this.repo.create({
      projectId: p.data.projectId,
      name: p.data.name,
      baseUrl: p.data.baseUrl ?? null,
      proxy: p.data.proxy ?? null,
      ssh: p.data.ssh ?? null,
      sortOrder: this.list(p.data.projectId).length,
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
    return this.repo.update(id, p.data, expectedVersion);
  }

  remove(id: string) {
    this.#ctx.db.transaction(() => {
      for (const v of this.vars.list(eq(variables.environmentId, id))) this.vars.remove(v.id);
      for (const s of this.secrets.list(eq(secrets.environmentId, id))) this.secrets.remove(s.id);
      this.repo.remove(id);
    });
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
    const row = this.repo.get(environmentId);
    const list = this.secrets.list(eq(secrets.environmentId, environmentId));
    if (list.length) this.#requireCipher();
    const plain: Secrets = Object.fromEntries(
      list.map((s) => [s.name, this.#cipher.decrypt(s.ciphertext)]),
    );
    const env = EnvSchema.parse({
      id: row.id,
      name: row.name,
      ...(row.baseUrl ? { baseUrl: row.baseUrl } : {}),
      variables: this.variables(environmentId),
      secretNames: Object.keys(plain),
      ...(row.proxy ? { proxy: row.proxy } : {}),
      ...(row.ssh ? { ssh: row.ssh } : {}),
    });
    return { env, secrets: plain };
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

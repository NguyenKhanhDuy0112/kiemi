import { z } from 'zod';
import { ProductKeySchema } from './product';

export const VariableNameSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Variable name must be letters, digits or `_`');

/**
 * Proxy for every browser session of an environment [G-06].
 * `server`: `http://host:port`, `https://host:port` or `socks5://host:port`.
 * Host names are resolved by the proxy (DNS through the proxy), so internal
 * names only known on the other side work.
 */
export const ProxySchema = z
  .object({
    server: z
      .string()
      .regex(
        /^(https?|socks5):\/\/[^\s/:]+(:\d{1,5})?\/?$/,
        'Proxy must look like http://host:port or socks5://host:port',
      ),
    username: z.string().min(1).optional(),
    /** Name of the secret holding the password (never the password itself) [E-08]. */
    passwordSecret: VariableNameSchema.optional(),
    /** Hosts that skip the proxy, e.g. `localhost`, `.company.local`, `10.0.0.0/8`. */
    bypass: z.array(z.string().min(1)).default([]),
  })
  .superRefine((p, ctx) => {
    if (
      p.server.startsWith('socks5://') &&
      (p.username !== undefined || p.passwordSecret !== undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'SOCKS5 proxies with username/password are not supported by the browser',
        path: ['username'],
      });
    }
    if (p.passwordSecret !== undefined && p.username === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Password needs a username', path: ['username'] });
    }
  });
export type ProxySettings = z.infer<typeof ProxySchema>;

/**
 * HTTP Basic / NTLM / Windows login of the environment's sites [W-01]: the
 * browser answers the 401 challenge with this user; the password is a secret NAME.
 */
export const HttpAuthSchema = z.object({
  username: z.string().min(1),
  passwordSecret: VariableNameSchema,
  /** Only answer challenges of this origin (`https://intranet.local`); empty = any site that asks. */
  origin: z
    .string()
    .regex(/^https?:\/\/[^\s/]+$/, 'Origin must look like https://host[:port]')
    .optional(),
});
export type HttpAuth = z.infer<typeof HttpAuthSchema>;

/**
 * Client certificate the browser presents to a site that asks for one (mutual TLS)
 * [W-02]. Files stay where they are; the passphrase is a secret NAME.
 */
export const ClientCertSchema = z
  .object({
    /** Site that asks for the certificate: `https://bank.example.com`. */
    origin: z.string().regex(/^https:\/\/[^\s/]+$/, 'Origin must look like https://host[:port]'),
    /** PEM certificate and key, or one PFX/PKCS#12 file. */
    certPath: z.string().min(1).max(1000).optional(),
    keyPath: z.string().min(1).max(1000).optional(),
    pfxPath: z.string().min(1).max(1000).optional(),
    passphraseSecret: VariableNameSchema.optional(),
  })
  .refine((c) => c.pfxPath !== undefined || (c.certPath !== undefined && c.keyPath !== undefined), {
    message: 'Give a PFX file, or both a certificate and a key',
    path: ['pfxPath'],
  });
export type ClientCert = z.infer<typeof ClientCertSchema>;
export const ClientCertsSchema = z.array(ClientCertSchema);

/** Kinds of database a test can look into [X-05]. */
export const DB_KINDS = ['postgres', 'mysql', 'mssql', 'sqlite'] as const;
export const DbKindSchema = z.enum(DB_KINDS);
export type DbKind = z.infer<typeof DbKindSchema>;

/**
 * A database a test may query on this environment [X-05]. The password is a secret NAME;
 * for SQLite `database` is the file path and no host/user is needed.
 */
export const DbConnectionSchema = z.object({
  /** Name used by the `queryDb` step. */
  name: VariableNameSchema,
  kind: DbKindSchema,
  host: z.string().max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().min(1).max(500),
  username: z.string().max(200).optional(),
  passwordSecret: VariableNameSchema.optional(),
  /** Encrypt the connection (TLS). */
  ssl: z.boolean().default(false),
});
export type DbConnection = z.infer<typeof DbConnectionSchema>;

/** Connection names are unique inside an environment. */
export const DbConnectionsSchema = z.array(DbConnectionSchema).superRefine((all, ctx) => {
  const seen = new Set<string>();
  for (const [i, c] of all.entries()) {
    if (seen.has(c.name))
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate connection "${c.name}"`,
        path: [i, 'name'],
      });
    seen.add(c.name);
  }
});

/**
 * One SSH hop. Credentials are secret NAMES (values live encrypted in the
 * environment's secrets) [G-07, E-08].
 */
export const SshHopSchema = z
  .object({
    host: z.string().trim().min(1),
    port: z.number().int().min(1).max(65535).default(22),
    username: z.string().trim().min(1),
    auth: z.enum(['password', 'key']).default('password'),
    passwordSecret: VariableNameSchema.optional(),
    privateKeySecret: VariableNameSchema.optional(),
    passphraseSecret: VariableNameSchema.optional(),
  })
  .superRefine((h, ctx) => {
    if (h.auth === 'password' && !h.passwordSecret) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose the secret holding the password',
        path: ['passwordSecret'],
      });
    }
    if (h.auth === 'key' && !h.privateKeySecret) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose the secret holding the private key',
        path: ['privateKeySecret'],
      });
    }
  });
export type SshHop = z.infer<typeof SshHopSchema>;

/**
 * SSH tunnel of an environment [G-07]: the app opens a local SOCKS proxy
 * through `target` (optionally via a `jump` host) for the run, then closes it.
 */
export const SshSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  target: SshHopSchema,
  jump: SshHopSchema.optional(),
});
export type SshSettings = z.infer<typeof SshSettingsSchema>;

/**
 * One cell of the Environment × Product matrix as the engine sees it [O-02]:
 * the product's URL, variables and network settings in the environment of the run.
 */
export const AppCellSchema = z.object({
  /** Product name, for error messages ("Sản phẩm 'Admin' chưa có ở môi trường 'UAT'"). */
  name: z.string().min(1),
  url: z.url().optional(),
  variables: z.record(VariableNameSchema, z.string()).default({}),
  proxy: ProxySchema.optional(),
  ssh: SshSettingsSchema.optional(),
  /** The product exists in the project but has no cell in this environment. */
  missing: z.boolean().default(false),
});
export type AppCell = z.infer<typeof AppCellSchema>;

/** Kind of environment [O-03]; `production` turns protection on by default [W-10]. */
export const ENV_TYPES = ['dev', 'test', 'uat', 'staging', 'production', 'other'] as const;
export const EnvTypeSchema = z.enum(ENV_TYPES);
export type EnvType = z.infer<typeof EnvTypeSchema>;

/** `#RRGGBB` colour shown on the title bar, the Run screen and reports [O-03]. */
export const EnvColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must look like #1F2A5C');

/** Default colour of each environment type (readable as a dot/stripe on light and dark). */
export const ENV_TYPE_COLORS: Record<EnvType, string> = {
  dev: '#3B82F6',
  test: '#8B5CF6',
  uat: '#F59E0B',
  staging: '#0EA5E9',
  production: '#E5484D',
  other: '#64748B',
};

/** Type suggested by a name: "Production", "PROD", "Chính thức" → production [O-03]. */
export function guessEnvType(name: string): EnvType {
  const n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
  if (/^(prod|production|live|that|chinh thuc|san xuat)\b/.test(n)) return 'production';
  if (/^(uat)\b/.test(n)) return 'uat';
  if (/^(staging|stg|pre-?prod)\b/.test(n)) return 'staging';
  if (/^(dev|development)\b/.test(n)) return 'dev';
  if (/^(test|qa|sit)\b/.test(n)) return 'test';
  return 'other';
}

/** Environment (dev / staging / prod…) with its variables [E-02]. */
export const EnvSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: EnvTypeSchema.default('other'),
  color: EnvColorSchema.optional(),
  /** How ambiguous numbers read: `1.250` = 1250 in `vi` (default), 1.25 in `en`; also number/money formats [P-10]. */
  locale: z.enum(['vi', 'en']).optional(),
  /** Steps that may write data (cleanup, API POST/PUT/PATCH/DELETE) are refused [W-10]. */
  protected: z.boolean().default(false),
  /** v1.0 single URL; now the main product's cell URL (`{{env.baseUrl}}` = `{{app}}`). */
  baseUrl: z.url().optional(),
  /** Cells of this environment by product key [O-02]. */
  apps: z.record(ProductKeySchema, AppCellSchema).default({}),
  /** Product key used when a test names none (the project's first product). */
  defaultProduct: ProductKeySchema.optional(),
  variables: z.record(VariableNameSchema, z.string()).default({}),
  /** Names of secrets this env expects; values never live in the env [E-08]. */
  secretNames: z.array(VariableNameSchema).default([]),
  /** HTTP Basic / NTLM / Windows auth for the sites of this env [W-01]. */
  httpAuth: HttpAuthSchema.optional(),
  /** Databases the `queryDb` step can read on this env [X-05]. */
  dbConnections: DbConnectionsSchema.optional(),
  /** Client certificates for sites that ask for one [W-02]. */
  clientCerts: ClientCertsSchema.optional(),
  /** Proxy used by every session of runs in this env [G-06]. */
  proxy: ProxySchema.optional(),
  /** SSH tunnel opened by the desktop app for runs in this env [G-07]. */
  ssh: SshSettingsSchema.optional(),
});
export type Env = z.infer<typeof EnvSchema>;

/** Decrypted secret values handed to the engine for one run [E-08]. */
export const SecretsSchema = z.record(VariableNameSchema, z.string());
export type Secrets = z.infer<typeof SecretsSchema>;

import type { AppCell, Env } from '@kiemi/schema';
import { EngineError } from '../errors';

/**
 * Value of `{{app}}` / `{{app.<key>}}` [O-02]: renders as the product's URL in
 * the environment of the run, and exposes `.<key>` (other products, on the root)
 * or `.<variable>` (cell variables, on a product) as properties.
 */
export class AppValue {
  readonly #key: string;
  readonly #cell: AppCell | undefined;
  readonly #envName: string;
  constructor(key: string, cell: AppCell | undefined, envName: string) {
    this.#key = key;
    this.#cell = cell;
    this.#envName = envName;
  }

  /** The product's URL; throws a readable error when the environment has none. */
  url(): string {
    const cell = this.#cell;
    if (!cell) {
      throw new EngineError('UNKNOWN_PRODUCT', `Unknown product "${this.#key}"`, {
        product: this.#key,
      });
    }
    if (cell.missing || !cell.url) {
      throw new EngineError(
        'APP_NOT_AVAILABLE',
        `Product "${cell.name}" is not set up in environment "${this.#envName}"`,
        { product: cell.name, environment: this.#envName, key: this.#key },
      );
    }
    return cell.url;
  }

  toString(): string {
    return this.url();
  }
}

/** Key of the test's main product: test → environment default → first cell. */
export function mainProductKey(env: Env | undefined, testProduct: string | undefined) {
  return testProduct ?? env?.defaultProduct ?? Object.keys(env?.apps ?? {})[0];
}

/** URL of the main product (or the v1.0 `env.baseUrl`), if any — never throws. */
export function mainAppUrl(env: Env | undefined, testProduct: string | undefined) {
  const key = mainProductKey(env, testProduct);
  const cell = key === undefined ? undefined : env?.apps[key];
  if (cell && !cell.missing && cell.url) return cell.url;
  return key !== undefined && env?.apps[key] ? undefined : env?.baseUrl;
}

/**
 * The `app` namespace: the main product's value, with every product key as a
 * property, each holding its cell variables. Getters keep errors lazy (only the
 * products a step uses must exist in the environment).
 */
export function appNamespace(
  env: Env | undefined,
  testProduct: string | undefined,
  expand: (v: string) => unknown,
): AppValue {
  const apps = env?.apps ?? {};
  const envName = env?.name ?? '';
  const key = mainProductKey(env, testProduct) ?? '';
  const legacy: AppCell | undefined =
    Object.keys(apps).length === 0 && env?.baseUrl
      ? { name: envName, url: env.baseUrl, variables: {}, missing: false }
      : undefined;
  const root = new AppValue(key, apps[key] ?? legacy, envName);
  for (const [k, cell] of Object.entries(apps)) {
    const child = new AppValue(k, cell, envName);
    for (const [name, v] of Object.entries(cell.variables)) {
      Object.defineProperty(child, name, { enumerable: true, get: () => expand(v) });
    }
    Object.defineProperty(root, k, { enumerable: true, value: child });
  }
  return root;
}

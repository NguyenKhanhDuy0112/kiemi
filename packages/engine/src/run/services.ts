import type {
  DataRow,
  Dataset,
  Diagnostic,
  Env,
  Secrets,
  SharedStep,
  TestCase,
} from '@kiemi/schema';
import type { BrowserContext, Page } from 'playwright-core';
import type { SessionPages } from '../browser/sessions';

export type DialogResponse = { action: 'accept'; text?: string } | { action: 'dismiss' };

export interface DialogInfo {
  session: string;
  type: string;
  message: string;
  response: DialogResponse['action'];
}

/**
 * Answers alert/confirm/prompt dialogs [A-14]. A `dialog` step arms the answer
 * for the next dialog of its session; without one, dialogs are accepted so the
 * flow continues.
 */
export class DialogController {
  readonly #armed = new Map<string, DialogResponse[]>();
  readonly history: DialogInfo[] = [];

  arm(session: string, response: DialogResponse): void {
    const q = this.#armed.get(session) ?? [];
    q.push(response);
    this.#armed.set(session, q);
  }

  /** Attaches the handler to a page of `session`. */
  attach(session: string, page: Page, onDialog?: (info: DialogInfo) => void): void {
    page.on('dialog', (dialog) => {
      const response = this.#armed.get(session)?.shift() ?? { action: 'accept' as const };
      const info: DialogInfo = {
        session,
        type: dialog.type(),
        message: dialog.message(),
        response: response.action,
      };
      this.history.push(info);
      onDialog?.(info);
      const done =
        response.action === 'accept'
          ? dialog.accept(
              response.text ?? (dialog.type() === 'prompt' ? dialog.defaultValue() : undefined),
            )
          : dialog.dismiss();
      done.catch(() => undefined);
    });
  }

  last(session: string): DialogInfo | undefined {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const d = this.history[i];
      if (d?.session === session) return d;
    }
    return undefined;
  }
}

/** Cookies + localStorage of a browser context, as Playwright returns it. */
export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** A login session saved earlier, reusable until `expiresAt` (ISO) [F-02]. */
export interface SavedLogin {
  state: StorageState;
  expiresAt: string;
}

/** Saved logins of the project: read at run start, saved ones reported back by event [F-02]. */
export interface SavedLoginStore {
  get(name: string): SavedLogin | undefined;
  save(name: string, login: SavedLogin): void;
}

/** Run-wide services available to actions. */
export interface RunServices {
  readonly testCase: TestCase;
  readonly env: Env | undefined;
  readonly secrets: Secrets;
  readonly dataset: Dataset | undefined;
  /** The dataset row of this run (`{{row.x}}`) [E-03]. */
  readonly row: DataRow | undefined;
  readonly sharedSteps: ReadonlyMap<string, SharedStep>;
  readonly pages: SessionPages;
  readonly dialogs: DialogController;
  readonly diagnostics: readonly Diagnostic[];
  /** Base folder for relative upload paths [A-11]. */
  readonly filesDir: string | undefined;
  /** Resolves a URL against the env's baseUrl [A-01]. */
  url(value: string): string;
  readonly savedLogins: SavedLoginStore;
  /** Clock of the run (injectable in tests). */
  now(): Date;
}

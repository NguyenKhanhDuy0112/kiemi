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
import type { DbClient } from '../db/client';

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
  /** Values noted by `observe`, returned in the run result [V-06]. */
  readonly observations: Record<string, string>;
  /** Re-login when the session expires, armed by `sessionGuard` [W-08]. */
  readonly guard: { current?: SessionGuardRule };
  /** Requests the pages sent, newest last, for `assertRequest` [Y-05]. */
  readonly requests: SentRequest[];
  /** Base folder for relative upload paths [A-11]. */
  readonly filesDir: string | undefined;
  /** Resolves a URL against the env's baseUrl [A-01]. */
  url(value: string): string;
  readonly savedLogins: SavedLoginStore;
  /** Database access given by the host; absent = `queryDb` cannot run [X-05]. */
  readonly db: DbClient | undefined;
  /** Clock of the run (injectable in tests). */
  now(): Date;
}

/** A request seen by a page [Y-05]. */
export interface SentRequest {
  session: string;
  method: string;
  url: string;
  /** Request body as text (cut at 20 000 characters). */
  body: string;
  at: number;
}

/** "When the login page shows up, run this shared login step and carry on" [W-08]. */
export interface SessionGuardRule {
  /** Text of the login page address, or `/regex/`. */
  loginUrl: string;
  shared: string;
  args: Record<string, unknown>;
}

/** Does the address belong to the login page? */
export function isLoginUrl(rule: SessionGuardRule, url: string): boolean {
  const m = /^\/(.+)\/([a-z]*)$/.exec(rule.loginUrl);
  if (m?.[1]) {
    try {
      return new RegExp(m[1], m[2]).test(url);
    } catch {
      return false;
    }
  }
  return url.toLowerCase().includes(rule.loginUrl.toLowerCase());
}

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type Patch, Repo, type RepoContext, validation } from '../repo';
import { settings } from '../tables';

/** App settings [S-07]. Stored per workspace as key → JSON value. */
export const AppSettingsSchema = z.object({
  language: z.enum(['vi', 'en']).default('vi'),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  browser: z.enum(['auto', 'msedge', 'chrome', 'chromium']).default('auto'),
  headless: z.boolean().default(false),
  /** Default per-step timeout in seconds [D-07]. */
  defaultTimeoutSec: z.number().int().min(1).max(600).default(10),
  /** Where run results go; empty = app data folder. */
  resultsDir: z.string().default(''),
  /** First-run welcome (S-08) answered or skipped. */
  onboardingDone: z.boolean().default(false),
  /** 3-step tour in the editor seen (L-02, U-14). */
  tourDone: z.boolean().default(false),
  /** Advanced mode: show and edit raw selectors [C-07]. */
  advancedMode: z.boolean().default(false),
  /** Send anonymous crash reports (opt-in, off by default) [N-09]. */
  crashReports: z.boolean().default(false),
  /** Turn off animations, on top of the OS "reduce motion" setting [U-17, U-13]. */
  reduceMotion: z.boolean().default(false),
  /** Workspace-level variables, inherited by every project [O-04]. */
  workspaceVariables: z
    .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string())
    .default({}),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

const f = AppSettingsSchema.shape;
/**
 * Some settings to save. No defaults here: Zod would fill them in even with `.partial()`,
 * and saving one setting would reset all the others.
 */
export const AppSettingsPatchSchema = z.object({
  language: f.language.unwrap().optional(),
  theme: f.theme.unwrap().optional(),
  browser: f.browser.unwrap().optional(),
  headless: f.headless.unwrap().optional(),
  defaultTimeoutSec: f.defaultTimeoutSec.unwrap().optional(),
  resultsDir: f.resultsDir.unwrap().optional(),
  onboardingDone: f.onboardingDone.unwrap().optional(),
  tourDone: f.tourDone.unwrap().optional(),
  advancedMode: f.advancedMode.unwrap().optional(),
  crashReports: f.crashReports.unwrap().optional(),
  reduceMotion: f.reduceMotion.unwrap().optional(),
  workspaceVariables: f.workspaceVariables.unwrap().optional(),
});
export type AppSettingsKey = keyof AppSettings;

export class SettingsService {
  readonly repo: Repo<typeof settings>;
  constructor(ctx: RepoContext) {
    this.repo = new Repo(ctx, settings, 'setting');
  }

  /** All settings with defaults filled in (unknown / invalid stored values are ignored). */
  getAll(): AppSettings {
    const stored: Record<string, unknown> = {};
    for (const row of this.repo.list()) stored[row.key] = row.value;
    const shape = AppSettingsSchema.shape;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape) as AppSettingsKey[]) {
      const r = shape[key].safeParse(stored[key]);
      out[key] = r.success ? r.data : shape[key].parse(undefined);
    }
    return out as AppSettings;
  }

  /** Saves some settings; returns all of them. */
  update(patch: Patch<AppSettings>): AppSettings {
    const p = AppSettingsPatchSchema.safeParse(patch);
    if (!p.success) throw validation('settings', p.error.issues);
    for (const [key, value] of Object.entries(p.data)) {
      if (value === undefined) continue;
      const cur = this.repo.list(eq(settings.key, key))[0];
      if (cur) this.repo.update(cur.id, { value });
      else this.repo.create({ key, value });
    }
    return this.getAll();
  }
}

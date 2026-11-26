import type { Locator, PopupRule } from '@kiemi/schema';
import type { Page } from 'playwright-core';
import { resolveLocator } from '../locator/resolve';

const frames = (page: Page) => [
  page.mainFrame(),
  ...page.frames().filter((f) => f !== page.mainFrame()),
];

/**
 * Closes the popups described by the project's rules that are on the page right now
 * ("if you see X, press Y") [W-09]. Looks once, never waits for a popup to appear.
 * Returns the names of the rules that fired.
 */
export async function closePopups(
  page: Page,
  rules: readonly PopupRule[],
  interpolate: (l: Locator) => Locator,
  signal?: AbortSignal,
): Promise<string[]> {
  const fired: string[] = [];
  // A closed popup can reveal the next one: a few rounds at most.
  for (let round = 0; round < 3; round++) {
    let any = false;
    for (const rule of rules) {
      if (!rule.enabled || page.isClosed()) continue;
      const seen = await resolveLocator(() => frames(page), interpolate(rule.when), {
        timeoutMs: 0,
        ...(signal ? { signal } : {}),
      }).catch(() => undefined);
      if (!seen) continue;
      try {
        if (rule.action.kind === 'escape') {
          await page.keyboard.press('Escape');
        } else {
          const target = await resolveLocator(() => frames(page), interpolate(rule.action.target), {
            timeoutMs: 1500,
            ...(signal ? { signal } : {}),
          });
          await target.locator.click({ timeout: 3000 });
        }
        fired.push(rule.name);
        any = true;
      } catch {
        // Could not close it: the step itself will report what is in the way.
      }
    }
    if (!any) break;
  }
  return fired;
}

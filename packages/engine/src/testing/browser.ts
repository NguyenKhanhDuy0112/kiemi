import { DEMO_HOST_RULES } from '@kiemi/demo-site/server';
import { type Browser, chromium } from 'playwright-core';

/**
 * Test-only: launches a headless browser for engine tests. Prefers the installed
 * Google Chrome (present on dev machines and CI runners), then Edge, then a
 * Playwright-downloaded Chromium.
 */
export async function launchTestBrowser(): Promise<Browser> {
  const errors: string[] = [];
  for (const channel of ['chrome', 'msedge', undefined] as const) {
    try {
      return await chromium.launch(
        channel
          ? { channel, headless: true, args: [DEMO_HOST_RULES] }
          : { headless: true, args: [DEMO_HOST_RULES] },
      );
    } catch (err) {
      errors.push(
        `${channel ?? 'chromium'}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
      );
    }
  }
  throw new Error(`No browser available for engine tests:\n${errors.join('\n')}`);
}

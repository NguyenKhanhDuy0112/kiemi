import { type DemoSite, startDemoSite } from '@kiemi/demo-site/server';
import {
  type RunResult,
  type SharedStep,
  type StepInput,
  type StepResult,
  type TestCaseInput,
  TestCaseSchema,
} from '@kiemi/schema';
import type { Browser } from 'playwright-core';
import { createDefaultRegistry } from '../actions';
import type { EngineEvent } from '../events';
import { type RunRequest, runTestCase } from '../runner';
import { launchTestBrowser } from '../testing/browser';

/** Test-only: one browser + one demo site shared by a test file. */
export interface E2E {
  browser: Browser;
  site: DemoSite;
  /** Runs inline steps against the demo site (env baseUrl = site URL). */
  run(
    steps: StepInput[],
    extra?: Partial<Omit<TestCaseInput, 'steps'>> & {
      request?: Partial<RunRequest>;
      events?: EngineEvent[];
      sharedSteps?: SharedStep[];
    },
  ): Promise<RunResult>;
  close(): Promise<void>;
}

const CI_STEP_TIMEOUT_MS = process.env.CI ? 30_000 : 10_000;

export async function startE2E(syncDelayMs = 0): Promise<E2E> {
  const [browser, site] = await Promise.all([launchTestBrowser(), startDemoSite({ syncDelayMs })]);
  const registry = createDefaultRegistry();
  let n = 0;
  return {
    browser,
    site,
    async run(steps, extra = {}) {
      const { request, events, sharedSteps, ...tc } = extra;
      await fetch(`${site.url}/api/reset`, { method: 'POST' });
      const testCase = TestCaseSchema.parse({
        schemaVersion: 2,
        id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f10',
        name: 'e2e',
        ...tc,
        steps: steps.map((s, i) => ({ ...s, id: s.id || `s${i + 1}` })),
      });
      return runTestCase(
        {
          runId: `run-${++n}`,
          testCase,
          env: {
            id: 'demo',
            name: 'Demo',
            baseUrl: site.url,
            variables: {},
            secretNames: [],
            apps: {},
            type: 'other',
            protected: false,
          },
          ...(sharedSteps ? { sharedSteps } : {}),
          ...request,
          // Cold browsers on CI runners (macOS especially) can need > 10 s for the first page.
          options: { defaultStepTimeoutMs: CI_STEP_TIMEOUT_MS, ...request?.options },
        },
        { registry, browser, ...(events ? { onEvent: (e) => events.push(e) } : {}) },
      );
    },
    async close() {
      await browser.close();
      await site.close();
    },
  };
}

/** Flattened `stepNo → status (code)` for readable assertions. */
export function summary(result: RunResult): string[] {
  const out: string[] = [];
  const walk = (list: readonly StepResult[], prefix: string) =>
    list.forEach((r, i) => {
      const no = `${prefix}${i + 1}`;
      out.push(`${no} ${r.status}${r.error ? ` ${r.error.code}` : ''}`);
      if (r.children) walk(r.children, `${no}.`);
    });
  walk(result.steps, '');
  return out;
}

export const step = (
  action: string,
  params: Record<string, unknown> = {},
  more: Partial<StepInput> = {},
): StepInput => ({
  id: '',
  action,
  params,
  ...more,
});

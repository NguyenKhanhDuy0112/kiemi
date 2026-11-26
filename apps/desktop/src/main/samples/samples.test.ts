// @vitest-environment node
import { createMemoryServices } from '@kiemi/db';
import { type DemoSite, startDemoSite } from '@kiemi/demo-site/server';
import { type Browser, chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCaller } from '../api/root';
import type { RunFeedEvent } from '../run/run-manager';
import { createTestRunManager } from '../run/testing';
import { SAMPLE_ENV, SAMPLE_PROJECT, sampleWorkbook, syncSampleEnvironment } from './samples';

async function launch(): Promise<Browser> {
  for (const channel of ['chrome', 'msedge', undefined] as const) {
    try {
      return await chromium.launch(channel ? { channel, headless: true } : { headless: true });
    } catch {
      // try the next one
    }
  }
  throw new Error('No browser for the sample tests');
}

let browser: Browser;
let site: DemoSite;
beforeAll(async () => {
  [browser, site] = await Promise.all([launch(), startDemoSite({ syncDelayMs: 500 })]);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await site?.close();
});

function setup() {
  const { services, defaultProjectId } = createMemoryServices();
  const runs = createTestRunManager(services, {
    // A run closes its browser: each run gets its own.
    worker: { launch: async () => ({ browser: await launch() }) },
  });
  const caller = createCaller({
    appVersion: '1',
    platform: 'darwin',
    services,
    defaultProjectId,
    runs,
    sampleSiteUrl: async () => site.url,
  });
  return { services, caller };
}

async function collect(iter: AsyncIterable<RunFeedEvent>): Promise<RunFeedEvent[]> {
  const out: RunFeedEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe('sample tests [L-01, S-08]', () => {
  it('builds an Excel file with a header and 3 rows', async () => {
    const bytes = await sampleWorkbook();
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // .xlsx is a zip file
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
  });

  it('installs the sample project once, and every sample test passes', async () => {
    const { services, caller } = setup();
    const first = await caller.samples.install();
    expect(first.created).toBe(true);
    const again = await caller.samples.install();
    expect(again).toMatchObject({ projectId: first.projectId, created: false });
    expect(services.projects.list().filter((p) => p.name === SAMPLE_PROJECT)).toHaveLength(1);

    const folder = services.folders.list(first.projectId).find((f) => f.name === 'Test mẫu');
    const tests = services.testCases.list(first.projectId, folder?.id);
    expect(tests.map((t) => t.name)).toEqual([
      '1. Đăng nhập',
      '2. Điền form và kiểm tra thông báo',
      '3. Nhân viên tạo đơn → quản lý thấy và duyệt',
      '4. Chạy theo dữ liệu Excel',
    ]);
    expect(first.firstTestId).toBe(tests[0]?.id);
    const [dataset] = services.datasets.list(first.projectId);
    expect(dataset?.source).toMatchObject({ kind: 'excel', fileName: 'don-nghi-mau.xlsx' });
    expect(dataset?.rows).toHaveLength(3);

    const suite = services.suites.list(first.projectId).find((s) => s.name === 'Tất cả test mẫu');
    const { runId } = await caller.runs.start({
      target: { kind: 'suite', suiteId: suite?.id ?? '' },
      options: { headless: true },
    });
    await collect(await caller.runs.events({ runId }));
    const run = await caller.runs.get({ runId });
    const failed = run.cases
      .filter((c) => c.status !== 'passed')
      .map((c) => ({
        test: tests.find((t) => t.id === c.testCaseId)?.name,
        steps: services.runs
          .listSteps(c.id)
          .filter((s) => s.status !== 'passed')
          .map((s) => `${s.stepNo} ${s.status} ${JSON.stringify(s.error)}`),
      }));
    expect(failed).toEqual([]);
    // 3 single runs + 3 data rows
    expect(run.cases).toHaveLength(6);
    expect(run.status).toBe('passed');
  }, 120_000);

  it('has a "Validate form" sample whose generated tests all pass on the sample site [L-03 #7]', async () => {
    const { services, caller } = setup();
    const { projectId } = await caller.samples.install();
    expect(services.projects.formSpecs(projectId)[0]?.fields).toHaveLength(5);
    const suite = services.suites.list(projectId).find((s) => s.name === 'Validate form Đăng ký');
    expect(suite).toBeDefined();
    const { runId } = await caller.runs.start({
      target: { kind: 'suite', suiteId: suite?.id ?? '' },
      options: { headless: true },
    });
    await collect(await caller.runs.events({ runId }));
    const run = await caller.runs.get({ runId });
    expect(run.cases.length).toBeGreaterThan(10);
    const bad = run.cases.filter((c) => c.status !== 'passed');
    expect(bad.map((c) => c.testName)).toEqual([]);
    expect(run.status).toBe('passed');
  }, 300_000);

  it('follows the sample site to its new address', async () => {
    const { services, caller } = setup();
    const { projectId } = await caller.samples.install();
    syncSampleEnvironment(services, 'http://127.0.0.1:50001');
    const row = services.environments.list(projectId).find((e) => e.name === SAMPLE_ENV);
    expect(services.environments.get(row?.id as string).baseUrl).toBe('http://127.0.0.1:50001');
  });
});

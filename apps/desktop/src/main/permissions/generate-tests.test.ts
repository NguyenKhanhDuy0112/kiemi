// @vitest-environment node
import { createMemoryServices, matrixFromTable, PERMISSION_TEMPLATE } from '@kiemi/db';
import { type DemoSite, startDemoSite } from '@kiemi/demo-site/server';
import { type Browser, chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCaller } from '../api/root';
import type { RunFeedEvent } from '../run/run-manager';
import { createTestRunManager } from '../run/testing';
import { generatePermissionTests } from './generate-tests';

async function launch(): Promise<Browser> {
  for (const channel of ['chrome', 'msedge', undefined] as const) {
    try {
      return await chromium.launch(channel ? { channel, headless: true } : { headless: true });
    } catch {
      // try the next one
    }
  }
  throw new Error('No browser for the permission tests');
}

let site: DemoSite;
beforeAll(async () => {
  site = await startDemoSite({ syncDelayMs: 0 });
}, 60_000);
afterAll(async () => {
  await site?.close();
});

const LOGINS: Record<string, string> = {
  'nhan-vien': 'nhanvien',
  'quan-ly': 'quanly',
  'ke-toan': 'ketoan',
};

function setup() {
  const { services, defaultProjectId: projectId } = createMemoryServices();
  const { matrix } = matrixFromTable(PERMISSION_TEMPLATE, 'Phân quyền cổng', 'pm1');
  services.projects.setPermissionMatrices(projectId, [
    {
      ...matrix,
      homePath: '/portal.html',
      roles: matrix.roles.map((r) => ({
        ...r,
        username: LOGINS[r.key] ?? '',
        password: '123456',
      })),
    },
  ]);
  const env = services.environments.create({ projectId, name: 'Demo', baseUrl: site.url });
  const runs = createTestRunManager(services, {
    worker: { launch: async () => ({ browser: await launch() }) },
  });
  const caller = createCaller({
    appVersion: '1',
    platform: 'darwin',
    services,
    defaultProjectId: projectId,
    runs,
    sampleSiteUrl: async () => site.url,
  });
  return { services, caller, projectId, envId: env.id };
}

async function runAll(
  { services, caller, projectId, envId }: ReturnType<typeof setup>,
  ids: string[],
) {
  const suite = services.suites.create({
    projectId,
    name: `Phân quyền ${Date.now()}`,
    environmentId: envId,
  });
  services.suites.setItems(
    suite.id,
    ids.map((testCaseId) => ({ testCaseId })),
  );
  const { runId } = await caller.runs.start({
    target: { kind: 'suite', suiteId: suite.id },
    options: { headless: true },
  });
  const out: RunFeedEvent[] = [];
  for await (const e of await caller.runs.events({ runId })) out.push(e);
  return caller.runs.get({ runId });
}

describe('permission matrix tests [Q-09]', () => {
  it('makes one test per role; all pass on the portal, then the cell that leaks is named', async () => {
    const ctx = setup();
    const { services, projectId } = ctx;
    const r = generatePermissionTests(services, { projectId, matrixId: 'pm1' });
    expect(r).toMatchObject({ created: 3, updated: 0 });
    // running the generator again rewrites the same tests
    expect(generatePermissionTests(services, { projectId, matrixId: 'pm1' })).toMatchObject({
      created: 0,
      updated: 3,
    });
    const tests = services.testCases.list(projectId, r.folderId);
    expect(tests.map((t) => t.name)).toEqual([
      'Phân quyền cổng — Kế toán',
      'Phân quyền cổng — Nhân viên',
      'Phân quyền cổng — Quản lý',
    ]);
    const ids = tests.map((t) => t.id);

    const ok = await runAll(ctx, ids);
    expect(
      ok.cases
        .filter((c) => c.status !== 'passed')
        .map((c) => ({
          test: c.testName,
          steps: services.runs
            .listSteps(c.id)
            .filter((x) => x.status !== 'passed' && x.status !== 'skipped')
            .map((x) => `${x.stepId} ${x.status} ${JSON.stringify(x.error)}`),
        })),
    ).toEqual([]);

    // The portal now (wrongly) opens "Bảng lương" for employees: only that cell must fail.
    await fetch(`${site.url}/api/portal/leak`, {
      method: 'POST',
      body: JSON.stringify({ role: 'nhanvien', fn: 'bang-luong' }),
    });
    const bad = await runAll(ctx, ids);
    const failedCases = bad.cases.filter((c) => c.status !== 'passed');
    expect(failedCases.map((c) => c.testName)).toEqual(['Phân quyền cổng — Nhân viên']);
    const failedSteps = services.runs
      .listSteps(failedCases[0]?.id ?? '')
      .filter((s) => s.status !== 'passed')
      .map((s) => s.stepId);
    expect(failedSteps).toEqual(['perm:nhan-vien|bang-luong:url']);
  }, 240_000);
});

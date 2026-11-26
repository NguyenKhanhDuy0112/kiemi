// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachProjectFolder, createMemoryServices } from '@kiemi/db';
import { type DemoSite, startDemoSite } from '@kiemi/demo-site/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installSamples, SAMPLE_ENV } from '../main/samples/samples';
import { PERMISSION_SAMPLE } from '../main/samples/samples-data';
import type { RunArgs } from './args';
import { EXIT, execute } from './run';

let site: DemoSite;
let folder: string;
beforeAll(async () => {
  site = await startDemoSite({ syncDelayMs: 0 });
  const { services } = createMemoryServices();
  const { projectId } = await installSamples(services, site.url);
  folder = mkdtempSync(join(tmpdir(), 'kiemi-cli-project-'));
  attachProjectFolder(services, projectId, folder);
}, 90_000);
afterAll(async () => {
  await site?.close();
});

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
}
const base = (more: Partial<RunArgs>): RunArgs => ({
  command: 'run',
  folder,
  headless: true,
  secrets: {},
  ...more,
});

describe('kiemi run [X-04]', () => {
  it('runs a suite from the project folder, with the secret from the command line, and writes JUnit', async () => {
    const o = io();
    const junit = join(mkdtempSync(join(tmpdir(), 'kiemi-cli-out-')), 'result.xml');
    const code = await execute(
      base({ suite: PERMISSION_SAMPLE, env: SAMPLE_ENV, secrets: { matKhau: '123456' }, junit }),
      o.io,
    );
    expect(o.err).toEqual([]);
    expect(code).toBe(EXIT.ok);
    expect(o.out.join('\n')).toContain('3/3 test đạt');
    const xml = readFileSync(junit, 'utf8');
    expect(xml).toContain('tests="3" failures="0" errors="0"');
    expect(xml).toContain('Mẫu 3. Ma trận phân quyền — Quản lý');
  }, 180_000);

  it('exits with 1 and names the failing test when a login is wrong', async () => {
    const o = io();
    const junit = join(mkdtempSync(join(tmpdir(), 'kiemi-cli-out-')), 'bad.xml');
    const code = await execute(
      base({ suite: PERMISSION_SAMPLE, env: SAMPLE_ENV, secrets: { matKhau: 'sai' }, junit }),
      o.io,
    );
    expect(code).toBe(EXIT.failed);
    expect(o.out.join('\n')).toContain('✘');
    expect(readFileSync(junit, 'utf8')).toMatch(/failures="[1-3]"/);
  }, 180_000);

  it('exits with 2 for a missing suite, environment or project folder', async () => {
    const a = io();
    expect(await execute(base({ suite: 'Không có' }), a.io)).toBe(EXIT.usage);
    expect(a.err.join('\n')).toContain('Không tìm thấy suite "Không có". Có:');
    const b = io();
    expect(await execute(base({ suite: PERMISSION_SAMPLE, env: 'zzz' }), b.io)).toBe(EXIT.usage);
    expect(b.err.join('\n')).toContain('môi trường');
    const c = io();
    expect(
      await execute(base({ folder: join(tmpdir(), 'kiemi-no-such-folder'), suite: 'x' }), c.io),
    ).toBe(EXIT.usage);
    expect(c.err[0]).toContain('Không mở được thư mục dự án');
  }, 60_000);
});

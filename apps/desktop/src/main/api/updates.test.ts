// @vitest-environment node
import { EventEmitter } from 'node:events';
import { createMemoryServices } from '@kiemi/db';
import { describe, expect, it, vi } from 'vitest';
import { createTestRunManager } from '../run/testing';
import { type UpdaterLike, UpdateService } from '../update/update-service';
import { createCaller } from './root';

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  checkForUpdates = vi.fn(async () => undefined);
  quitAndInstall = vi.fn();
}

function caller(updates?: UpdateService, openExternal = vi.fn()) {
  const { services, defaultProjectId } = createMemoryServices();
  return createCaller({
    appVersion: '1',
    platform: 'win32',
    services,
    defaultProjectId,
    runs: createTestRunManager(services),
    ...(updates ? { updates } : {}),
    desktop: {
      openTrace: async () => undefined,
      showInFolder: () => undefined,
      openExternal,
      openFolder: () => undefined,
      pickFolder: async () => undefined,
    },
  });
}

describe('updates router [N-12]', () => {
  it('is off without an update service (development)', async () => {
    const c = caller();
    expect(await c.updates.state()).toEqual({ status: 'off' });
    expect(await c.updates.check()).toEqual({ status: 'off' });
    await expect(c.updates.install()).rejects.toThrow();
  });

  it('restarts to install a downloaded update', async () => {
    const u = new FakeUpdater();
    const c = caller(new UpdateService({ updater: u, mode: 'auto', releasePageUrl: 'https://x' }));
    await expect(c.updates.install()).rejects.toThrow();
    u.emit('update-downloaded', { version: '1.1.0' });
    expect(await c.updates.state()).toMatchObject({ status: 'ready', version: '1.1.0' });
    expect(await c.updates.install()).toBe(true);
    expect(u.quitAndInstall).toHaveBeenCalled();
  });

  it('portable: opens the release page to download', async () => {
    const u = new FakeUpdater();
    const open = vi.fn();
    const page = 'https://github.com/o/r/releases/latest';
    const c = caller(new UpdateService({ updater: u, mode: 'notify', releasePageUrl: page }), open);
    u.emit('update-available', { version: '1.1.0' });
    expect(await c.updates.openDownloadPage()).toBe(true);
    expect(open).toHaveBeenCalledWith(page);
  });
});

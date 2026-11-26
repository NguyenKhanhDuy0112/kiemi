// @vitest-environment node
import { createMemoryServices } from '@kiemi/db';
import type { Recorder, RecorderOptions } from '@kiemi/recorder';
import type { Locator, Step } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { createCaller } from '../api/root';
import { createTestRunManager, InProcessWorker } from '../run/testing';
import { RecorderManager, type RecordFeedEvent } from './recorder-manager';

const step = (id: string): Step => ({
  id,
  action: 'click',
  params: { target: { strategies: [{ kind: 'css', value: `#${id}` }] } },
  session: 'default',
  enabled: true,
  mode: 'hard',
});
const picked: Locator = { strategies: [{ kind: 'role', role: 'button', name: 'Lưu' }] };

function setup() {
  const { services, defaultProjectId } = createMemoryServices();
  const env = services.environments.create({
    projectId: defaultProjectId,
    name: 'Thử',
    baseUrl: 'http://app.test',
  });
  const t = services.testCases.create({ projectId: defaultProjectId, name: 'Ghi' });
  services.testCases.save(t.id, {
    ...t.content,
    sessions: ['default', 'admin'],
    steps: [
      { id: 's1', action: 'goto', params: { url: '/' } },
      { id: 's2', action: 'click', params: { target: { css: '#a' } }, session: 'admin' },
    ],
  });
  const calls: { options?: RecorderOptions; resolved: [string, boolean][]; started: string[] } = {
    resolved: [],
    started: [],
  };
  const fakeRecorder = async (_ctx: unknown, options: RecorderOptions): Promise<Recorder> => {
    calls.options = options;
    const steps: Step[] = [];
    setTimeout(() => {
      steps.push(step('r1'));
      options.onChange?.([{ type: 'add', index: 0, step: step('r1') }], steps);
      options.onSuggestions?.([
        {
          id: 'sg1',
          afterStepId: 'r1',
          kind: 'toast',
          text: 'Đã lưu',
          step: { action: 'assertToast', params: { text: 'Đã lưu' } },
        },
      ]);
      void options.onSaveLogin?.('nhanVien', {
        cookies: [{ name: 'sid', value: 'cookie-secret', domain: 'app.test', path: '/' }] as never,
        origins: [],
      });
      options.onStopRequest?.();
    }, 5);
    return {
      get steps() {
        return steps;
      },
      page: undefined,
      activePage: () => undefined,
      pick: async () => picked,
      highlight: async () => ({ count: 2 }),
      suggestions: () => [],
      resolveSuggestion: (id, accept) => calls.resolved.push([id, accept]),
      stop: async () => steps,
    };
  };
  const fakePage = {
    goto: async (u: string) => calls.started.push(u),
    bringToFront: async () => {},
    isClosed: () => false,
    evaluate: async () => [
      {
        name: 'register',
        controls: [
          {
            tag: 'input',
            type: 'email',
            id: 'email',
            name: 'email',
            label: 'Email',
            labelStar: true,
            placeholder: '',
            required: false,
            readOnly: false,
            minLength: null,
            maxLength: 100,
            min: null,
            max: null,
            pattern: null,
            accept: null,
            value: '',
            options: [],
            css: '#email',
          },
        ],
      },
      { name: 'empty', controls: [] },
    ],
  };
  const fakeContext = { pages: () => [fakePage], newPage: async () => fakePage, on: () => {} };
  const fakeBrowser = {
    close: async () => undefined,
    newContext: async () => fakeContext,
  };
  const recorder = new RecorderManager({
    services,
    browsersPath: '/tmp/kiemi-test-browsers',
    spawnWorker: () =>
      new InProcessWorker({
        launch: async () => ({ browser: fakeBrowser as never }),
        run: async (req, opts) => {
          calls.started.push(`prefix:${req.options?.stopAfterStepId}`);
          opts.keepSessions?.({
            context: async () => fakeContext,
            page: async () => fakePage,
            closeAll: async () => [],
          } as never);
          return { status: 'passed' } as never;
        },
        startRecorder: fakeRecorder as never,
      }),
  });
  const caller = createCaller({
    appVersion: '1',
    platform: 'darwin',
    services,
    defaultProjectId,
    runs: createTestRunManager(services),
    recorder,
  });
  return {
    services,
    recorder,
    caller,
    testId: t.id,
    envId: env.id,
    projectId: defaultProjectId,
    calls,
  };
}

async function until(
  rec: RecorderManager,
  id: string,
  pred: (e: RecordFeedEvent) => boolean,
): Promise<RecordFeedEvent[]> {
  const out: RecordFeedEvent[] = [];
  for await (const e of rec.events(id)) {
    out.push(e);
    if (pred(e)) break;
  }
  return out;
}

describe('RecorderManager [M5]', () => {
  it('records in the engine process and streams changes, suggestions and requests', async () => {
    const { recorder, caller, testId, services, projectId, calls, envId } = setup();
    const info = await caller.recorder.start({
      testCaseId: testId,
      url: '/login.html',
      environmentId: envId,
    });
    expect(info).toMatchObject({ mode: 'record', session: 'default', afterStepId: null });
    const events = await until(
      recorder,
      info.recordingId,
      (e) => e.type === 'stopRequest' || (e.type === 'status' && e.state === 'error'),
    );
    expect(events.find((e) => e.type === 'status' && e.state === 'error')).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual([
      'status',
      'status',
      'changes',
      'suggestions',
      'loginSaved',
      'stopRequest',
    ]);
    expect(calls.started).toEqual(['http://app.test/login.html']);
    expect(calls.options).toMatchObject({
      baseUrl: 'http://app.test',
      capture: true,
      toolbar: true,
    });
    expect(calls.options?.strings?.addCheck).toBe('Thêm kiểm tra');
    // The login is stored encrypted, the UI only gets its name.
    expect(JSON.stringify(events)).not.toContain('cookie-secret');
    expect(services.savedLogins.list(projectId).map((l) => l.name)).toEqual(['nhanVien']);

    expect(await caller.recorder.pick({ recordingId: info.recordingId })).toEqual({
      locator: picked,
    });
    expect(
      await caller.recorder.highlight({ recordingId: info.recordingId, locator: picked }),
    ).toEqual({ count: 2 });
    await caller.recorder.suggestion({ recordingId: info.recordingId, id: 'sg1', accept: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.resolved).toEqual([['sg1', true]]);

    await caller.recorder.stop({ recordingId: info.recordingId });
    const rest = await until(recorder, info.recordingId, () => false);
    expect(rest.slice(-2)).toMatchObject([
      { type: 'done', steps: [{ id: 'r1' }] },
      { type: 'status', state: 'stopped' },
    ]);
    expect(await caller.recorder.current()).toBeNull();
  });

  it('opens a product page without a test and reads its forms as field specs [R-02]', async () => {
    const { recorder, caller, projectId, calls, envId } = setup();
    const info = await caller.recorder.startScan({
      projectId,
      environmentId: envId,
      url: '/dang-ky',
    });
    expect(info).toMatchObject({ mode: 'inspect', testCaseId: '' });
    await until(recorder, info.recordingId, (e) => e.type === 'status' && e.state === 'recording');
    const forms = await caller.recorder.scanForms({ recordingId: info.recordingId });
    expect(calls.started).toEqual(['http://app.test/dang-ky']);
    expect(forms).toHaveLength(1);
    expect(forms[0]?.fields[0]).toMatchObject({
      key: 'email',
      type: 'email',
      required: true,
      maxLength: 100,
    });
    await caller.recorder.stop({ recordingId: info.recordingId });
  });

  it('records from step X in its session, after running the steps up to X [K-04]', async () => {
    const { recorder, caller, testId, calls } = setup();
    const info = await caller.recorder.start({ testCaseId: testId, afterStepId: 's2' });
    expect(info).toMatchObject({ session: 'admin', afterStepId: 's2' });
    const events = await until(recorder, info.recordingId, (e) => e.type === 'changes');
    expect(events[1]).toMatchObject({ type: 'status', state: 'recording', prefixStatus: 'passed' });
    expect(calls.started).toEqual(['prefix:s2']);
    await caller.recorder.stop({ recordingId: info.recordingId });
  });

  it('starts logged in with a saved login, and Pick-only sessions record nothing [F-02, C-06]', async () => {
    const { recorder, caller, testId, calls, envId } = setup();
    const info = await caller.recorder.start({
      testCaseId: testId,
      environmentId: envId,
      loginName: 'nhanVien',
      mode: 'inspect',
    });
    await until(recorder, info.recordingId, (e) => e.type === 'status' && e.state === 'recording');
    expect(calls.started).toEqual(['prefix:login', 'http://app.test']);
    expect(calls.options).toMatchObject({ capture: false, toolbar: false });
    // Starting another session stops this one.
    const next = await caller.recorder.start({ testCaseId: testId });
    expect(next.recordingId).not.toBe(info.recordingId);
    await caller.recorder.stop({ recordingId: next.recordingId });
  });
});

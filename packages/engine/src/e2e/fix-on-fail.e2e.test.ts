import type { Locator, StepInput } from '@kiemi/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findSimilar } from '../locator/similar';
import { DebugController } from '../run/debug';
import { type E2E, startE2E, summary } from './helpers';

/**
 * M10-11 [FX-01 → FX-07, W-09]: a failed step keeps the browser open; the tester
 * fixes it (similar element, wait longer, popup rule, new expectation) and the run goes on.
 */
let e: E2E;
beforeAll(async () => {
  e = await startE2E();
});
afterAll(async () => {
  await e?.close();
});

const saveLocator: Locator = {
  strategies: [{ kind: 'css', value: '#btn-save' }],
  fingerprint: {
    tag: 'button',
    text: 'Lưu',
    attributes: { id: 'btn-save', class: 'btn primary', type: 'button' },
    neighbors: [],
  },
};
const open = (mode: string): StepInput => ({
  id: 'open',
  action: 'goto',
  params: { url: `{{app}}/fixes.html?mode=${mode}` },
});
const clickSave = (extra: Partial<StepInput> = {}): StepInput => ({
  id: 'save',
  action: 'click',
  params: { target: saveLocator },
  ...extra,
});
const expectSaved = (value = 'Đã lưu'): StepInput => ({
  id: 'check',
  action: 'assertText',
  params: { target: { css: '#fix-result' }, op: 'equals', value },
});

/** Runs until a step fails and the run waits; returns what the tester sees then. */
async function untilFailed(dbg: DebugController, done: Promise<unknown>) {
  const stop = Date.now() + 20_000;
  while (!dbg.failed && Date.now() < stop) {
    await Promise.race([done, new Promise((r) => setTimeout(r, 50))]);
  }
  if (!dbg.failed) throw new Error('the run never waited on a failed step');
  return dbg.failed;
}

describe('fixing a failed step with the browser kept open', () => {
  it('renamed button: the run waits, a similar element is found, retry passes [FX-01, FX-06]', async () => {
    const dbg = new DebugController({ pauseOnFail: true });
    const done = e.run([open('renamed'), clickSave({ timeoutMs: 1500 }), expectSaved()], {
      debugger: dbg,
    });
    const failed = await untilFailed(dbg, done);
    expect(failed.step.stepId).toBe('save');
    expect(failed.error.code).toBe('ELEMENT_NOT_FOUND');

    const page = await dbg.live?.page('default');
    const similar = await findSimilar(page as NonNullable<typeof page>, saveLocator);
    expect(similar[0]?.label).toContain('Lưu lại');
    dbg.editStep({
      id: 'save',
      action: 'click',
      params: { target: similar[0]?.locator },
      session: 'default',
      enabled: true,
      mode: 'hard',
    } as never);
    dbg.decide('retry');
    const result = await done;
    expect(summary(result as never)).toEqual(['1 passed', '2 passed', '3 passed']);
  });

  it('slow page: wait longer and retry [FX-06]', async () => {
    const dbg = new DebugController({ pauseOnFail: true });
    const done = e.run([open('slow'), clickSave({ timeoutMs: 600 }), expectSaved()], {
      debugger: dbg,
    });
    const failed = await untilFailed(dbg, done);
    expect(['ELEMENT_NOT_FOUND', 'STEP_TIMEOUT']).toContain(failed.error.code);
    dbg.editStep({
      id: 'save',
      action: 'click',
      params: { target: saveLocator },
      timeoutMs: 15_000,
      session: 'default',
      enabled: true,
      mode: 'hard',
    } as never);
    dbg.decide('retry');
    expect((await done).status).toBe('passed');
  });

  it('popup in the way: a project rule closes it by itself [W-09]', async () => {
    const rule = {
      id: 'cookie',
      name: 'Banner cookie',
      enabled: true,
      when: { strategies: [{ kind: 'text' as const, value: 'Chúng tôi dùng cookie' }] },
      action: {
        kind: 'click' as const,
        target: { strategies: [{ kind: 'role' as const, role: 'button', name: 'Đồng ý' }] },
      },
    };
    const wait = { id: 'w', action: 'wait', params: { seconds: 1 } } as StepInput;
    const without = new DebugController({ pauseOnFail: false });
    const bad = await e.run([open('popup'), wait, clickSave({ timeoutMs: 1000 })], {
      debugger: without,
    });
    expect(bad.status).toBe('failed');

    const ok = await e.run([open('popup'), wait, clickSave(), expectSaved()], {
      request: { popupRules: [rule] },
    });
    expect(ok.status).toBe('passed');
  });

  it('popup in the way: adding the rule while the run waits, then retry [FX-06]', async () => {
    const dbg = new DebugController({ pauseOnFail: true });
    const wait = { id: 'w', action: 'wait', params: { seconds: 1 } } as StepInput;
    const done = e.run([open('popup'), wait, clickSave({ timeoutMs: 1000 }), expectSaved()], {
      debugger: dbg,
    });
    const failed = await untilFailed(dbg, done);
    expect(failed.step.stepId).toBe('save');
    dbg.editPopupRules([
      {
        id: 'cookie',
        name: 'Banner cookie',
        enabled: true,
        when: { strategies: [{ kind: 'text', value: 'Chúng tôi dùng cookie' }] },
        action: { kind: 'click', target: { strategies: [{ kind: 'text', value: 'Đồng ý' }] } },
      },
    ]);
    dbg.decide('retry');
    expect((await done).status).toBe('passed');
  });

  it('wrong value: the check reports expected / actual and takes the real value [FX-07]', async () => {
    const dbg = new DebugController({ pauseOnFail: true });
    // A wrong check retries until the step timeout (30 s on CI): keep it short.
    const done = e.run([open('wrongvalue'), clickSave(), expectSaved('Đã lưu 3 bản ghi')], {
      debugger: dbg,
      request: { options: { defaultStepTimeoutMs: 3000 } },
    });
    const failed = await untilFailed(dbg, done);
    expect(failed.step.stepId).toBe('check');
    expect(failed.error.code).toBe('ASSERTION_FAILED');
    expect(failed.error.details).toMatchObject({
      expected: 'Đã lưu 3 bản ghi',
      actual: 'Đã lưu 5 bản ghi',
    });
    dbg.editStep({
      id: 'check',
      action: 'assertText',
      params: { target: { css: '#fix-result' }, op: 'equals', value: 'Đã lưu 5 bản ghi' },
      session: 'default',
      enabled: true,
      mode: 'hard',
    } as never);
    dbg.decide('retry');
    expect((await done).status).toBe('passed');
  });

  it('a step added before the failed one runs first, then the failed one again [FX-04]', async () => {
    const dbg = new DebugController({ pauseOnFail: true });
    const wait = { id: 'w', action: 'wait', params: { seconds: 1 } } as StepInput;
    const done = e.run([open('popup'), wait, clickSave({ timeoutMs: 1000 }), expectSaved()], {
      debugger: dbg,
    });
    await untilFailed(dbg, done);
    dbg.insert('save', 'before', [
      {
        id: 'close',
        action: 'click',
        params: { target: { text: 'Đồng ý' } },
        session: 'default',
        enabled: true,
        mode: 'hard',
      } as never,
    ]);
    dbg.decide('retry');
    const result = await done;
    expect(result.status).toBe('passed');
    expect(result.steps.map((s) => s.stepId)).toEqual(['open', 'w', 'close', 'save', 'check']);
  });

  it('skip and continue let the run reach the end', async () => {
    const dbg = new DebugController({ pauseOnFail: true });
    const done = e.run([open('renamed'), clickSave({ timeoutMs: 800 }), expectSaved('—')], {
      debugger: dbg,
    });
    await untilFailed(dbg, done);
    dbg.decide('skip');
    const result = await done;
    expect(summary(result as never)).toEqual(['1 passed', '2 skipped', '3 passed']);
  });
});

// @vitest-environment happy-dom
import { type TestCase, TestCaseSchema } from '@kiemi/schema';
import { createI18n } from '@renderer/i18n';
import { act, cleanup, render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flatten, updateStep } from './doc-model';
import { useEditorStore } from './editor-store';

// The table needs no IPC; the run store only imports the client.
vi.mock('@renderer/lib/trpc', () => ({ trpc: {}, trpcClient: {} }));

/** Counts row renders: every row renders exactly one sentence. */
const renders = vi.hoisted(() => ({ n: 0 }));
vi.mock('./step-sentence', async (load) => {
  const m = await load<typeof import('./step-sentence')>();
  return {
    ...m,
    StepSentence: (p: Parameters<typeof m.StepSentence>[0]) => {
      renders.n++;
      return m.StepSentence(p);
    },
  };
});

const { StepTable } = await import('./step-table');

function bigDoc(n: number): TestCase {
  return TestCaseSchema.parse({
    schemaVersion: 2,
    id: '0193a5b2-7c4e-7d1a-9f3b-2c8e4a6d1f40',
    name: 'Hai trăm bước',
    steps: [
      {
        id: 'loop',
        action: 'loop',
        params: {
          times: 2,
          steps: [{ id: 'in1', action: 'click', params: { target: { text: 'A' } } }],
        },
      },
      ...Array.from({ length: n - 2 }, (_, i) => ({
        id: `s${i}`,
        action: i % 2 ? 'fill' : 'click',
        params:
          i % 2
            ? { target: { label: `Ô ${i}` }, value: `v${i}` }
            : { target: { text: `Nút ${i}` } },
      })),
    ],
  });
}

describe('200-step test stays smooth (N-05, M6-04)', () => {
  afterEach(cleanup);

  it('editing a step keeps every other step object', () => {
    const doc = bigDoc(200);
    const next = updateStep(doc, 's50', { params: { target: { label: 'Mới' }, value: 'x' } });
    const before = flatten(doc);
    const after = flatten(next);
    const changed = after.filter((r, i) => r.step !== before[i]?.step).map((r) => r.step.id);
    expect(changed).toEqual(['s50']);
    expect(next.elements).toBe(doc.elements);
    // inner step: only it and its container change
    const inner = updateStep(doc, 'in1', { enabled: false });
    const changedInner = flatten(inner)
      .filter((r, i) => r.step !== before[i]?.step)
      .map((r) => r.step.id);
    expect(changedInner).toEqual(['loop', 'in1']);
    // the original is untouched (undo history)
    expect(flatten(doc).find((r) => r.step.id === 'in1')?.step.enabled).not.toBe(false);
    expect(flatten(inner).find((r) => r.step.id === 'in1')?.step.enabled).toBe(false);
  });

  it('re-renders only the edited / selected rows', () => {
    const doc = bigDoc(200);
    useEditorStore.getState().load('t1', doc, 1);
    const names = new Map<string, string>();
    const onChip = () => {};
    const t0 = performance.now();
    render(
      <I18nextProvider i18n={createI18n()}>
        <StepTable sharedNames={names} onChip={onChip} />
      </I18nextProvider>,
    );
    const mountMs = performance.now() - t0;
    expect(renders.n).toBe(200); // 199 top-level steps + 1 inner step
    // Coarse ceiling only (happy-dom is far slower than Chromium; shared CI runners vary a lot).
    // The real guard of N-05 is the render counts below.
    expect(mountMs).toBeLessThan(process.env.CI ? 15_000 : 5000);

    renders.n = 0;
    act(() => useEditorStore.getState().select('s10'));
    expect(renders.n).toBeLessThanOrEqual(1);

    renders.n = 0;
    act(() =>
      useEditorStore
        .getState()
        .apply((d) => updateStep(d, 's10', { params: { target: { text: 'Lưu' } } })),
    );
    expect(renders.n).toBe(1);
  });
});

import type { HighlightResult, StepChange, Suggestion } from '@kiemi/recorder';
import type { Locator, RunError, Step } from '@kiemi/schema';
import { trpcClient } from '@renderer/lib/trpc';
import { create } from 'zustand';
import { useEditorStore } from '../editor/editor-store';
import { applyRecordChanges } from './apply-changes';

export type RecordState = 'idle' | 'starting' | 'recording' | 'error';

/** A password typed while recording, waiting for "Lưu thành bí mật?" [K-05]. */
export interface PasswordPrompt {
  stepId: string;
  value: string;
  target: unknown;
}

interface StartOptions {
  testId: string;
  mode: 'record' | 'inspect';
  url?: string | undefined;
  afterStepId?: string | undefined;
  loginName?: string | undefined;
}

interface RecordStore {
  recordingId: string | null;
  testId: string | null;
  mode: 'record' | 'inspect';
  state: RecordState;
  error: RunError | null;
  environmentId: string | null;
  /** Mirror of the recorder's list (for applying changes in order). */
  recorded: Step[];
  /** Step the first recorded step goes after (null = first). */
  anchorId: string | null;
  suggestions: Suggestion[];
  passwords: PasswordPrompt[];
  prefixFailed: boolean;
  download: number | null;
  /** Called with the name when a login is saved; and with the count when stopped. */
  onNotice?: (n: { kind: 'loginSaved'; name: string } | { kind: 'stopped'; count: number }) => void;
  start(o: StartOptions): Promise<void>;
  stop(): Promise<void>;
  /** Pick an element in the browser; opens a Pick-only browser if none is open [C-06]. */
  pick(testId: string): Promise<Locator | null>;
  highlight(testId: string, locator: Locator): Promise<HighlightResult>;
  resolveSuggestion(id: string, accept: boolean): Promise<void>;
  dropPassword(stepId: string): void;
}

let unsubscribe: (() => void) | undefined;
let ready: { promise: Promise<void>; resolve: () => void } | undefined;
const newReady = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  ready = { promise, resolve };
};

export const useRecordStore = create<RecordStore>((set, get) => {
  const applyChanges = (changes: StepChange[]) => {
    const s = get();
    if (s.mode !== 'record') return;
    const editor = useEditorStore.getState();
    let recorded = s.recorded;
    if (editor.testId === s.testId) {
      editor.patch((doc) => {
        const out = applyRecordChanges(doc, recorded, changes, s.anchorId);
        recorded = out.recorded;
        return out.doc;
      });
    } else {
      // The editor is closed: keep the mirror in sync anyway.
      recorded = applyRecordChanges(
        {
          schemaVersion: 2,
          id: 'x',
          name: 'x',
          tags: [],
          sessions: [],
          elements: {},
          variables: {},
          steps: [],
          cleanup: [],
        } as never,
        recorded,
        changes,
        null,
      ).recorded;
    }
    const passwords = [...s.passwords];
    for (const c of changes) {
      if (c.type === 'remove') continue;
      if ('password' in c && c.password) {
        const at = passwords.findIndex((p) => p.stepId === c.step.id);
        const p = {
          stepId: c.step.id,
          value: String(c.step.params.value ?? ''),
          target: c.step.params.target,
        };
        if (at >= 0) passwords[at] = p;
        else passwords.push(p);
      }
    }
    set({ recorded, passwords });
  };

  const follow = (recordingId: string) => {
    unsubscribe?.();
    const sub = trpcClient.recorder.events.subscribe(
      { recordingId },
      {
        onData: (e) => {
          if (get().recordingId !== recordingId) return;
          switch (e.type) {
            case 'status':
              if (e.state === 'recording') {
                set({
                  state: 'recording',
                  download: null,
                  prefixFailed: !!e.prefixStatus && e.prefixStatus !== 'passed',
                });
                ready?.resolve();
              } else if (e.state === 'error') {
                set({ state: 'error', error: e.error ?? null, recordingId: null });
                ready?.resolve();
              } else if (e.state === 'stopped') {
                const count = get().recorded.length;
                if (get().mode === 'record') get().onNotice?.({ kind: 'stopped', count });
                set({ state: 'idle', recordingId: null, suggestions: [] });
                ready?.resolve();
              }
              return;
            case 'download':
              set({ download: e.percent });
              return;
            case 'changes':
              applyChanges(e.changes);
              return;
            case 'suggestions':
              set({ suggestions: e.list });
              return;
            case 'stopRequest':
              void get().stop();
              return;
            case 'loginSaved':
              get().onNotice?.({ kind: 'loginSaved', name: e.name });
              return;
            default:
              return;
          }
        },
        onComplete: () => {
          if (get().recordingId === recordingId) set({ state: 'idle', recordingId: null });
        },
        onError: () => {
          if (get().recordingId === recordingId) set({ state: 'idle', recordingId: null });
        },
      },
    );
    unsubscribe = () => sub.unsubscribe();
  };

  const ensureSession = async (testId: string) => {
    const s = get();
    if (s.recordingId && s.testId === testId && s.state !== 'error') {
      if (s.state === 'starting') await ready?.promise;
      return get().recordingId;
    }
    // Pick-only browser opens where the test starts.
    const doc = useEditorStore.getState().doc;
    const first = doc?.steps.find((x) => x.action === 'goto')?.params.url;
    await get().start({
      testId,
      mode: 'inspect',
      ...(typeof first === 'string' && !first.includes('{{') ? { url: first } : {}),
    });
    await ready?.promise;
    return get().recordingId;
  };

  return {
    recordingId: null,
    testId: null,
    mode: 'record',
    state: 'idle',
    error: null,
    environmentId: null,
    recorded: [],
    anchorId: null,
    suggestions: [],
    passwords: [],
    prefixFailed: false,
    download: null,

    async start(o) {
      newReady();
      const editor = useEditorStore.getState();
      const doc = editor.testId === o.testId ? editor.doc : null;
      const anchorId = o.afterStepId ?? doc?.steps.at(-1)?.id ?? null;
      set({
        state: 'starting',
        error: null,
        testId: o.testId,
        mode: o.mode,
        recorded: [],
        anchorId,
        suggestions: [],
        passwords: [],
        prefixFailed: false,
        download: null,
      });
      try {
        const info = await trpcClient.recorder.start.mutate({
          testCaseId: o.testId,
          mode: o.mode,
          ...(o.url ? { url: o.url } : {}),
          ...(o.afterStepId ? { afterStepId: o.afterStepId } : {}),
          ...(o.loginName ? { loginName: o.loginName } : {}),
        });
        // One undo removes everything recorded.
        if (o.mode === 'record' && editor.testId === o.testId) editor.checkpoint();
        set({ recordingId: info.recordingId, environmentId: info.environmentId });
        follow(info.recordingId);
      } catch (err) {
        set({ state: 'error', error: { code: 'ENGINE_ERROR', message: String(err) } });
        ready?.resolve();
        throw err;
      }
    },

    async stop() {
      const id = get().recordingId;
      if (id) await trpcClient.recorder.stop.mutate({ recordingId: id });
    },

    async pick(testId) {
      const id = await ensureSession(testId);
      if (!id) return null;
      const { locator } = await trpcClient.recorder.pick.mutate({ recordingId: id });
      return locator;
    },

    async highlight(testId, locator) {
      const id = await ensureSession(testId);
      if (!id) return { count: 0 };
      return trpcClient.recorder.highlight.mutate({ recordingId: id, locator });
    },

    async resolveSuggestion(id, accept) {
      const rid = get().recordingId;
      set({ suggestions: get().suggestions.filter((s) => s.id !== id) });
      if (rid) await trpcClient.recorder.suggestion.mutate({ recordingId: rid, id, accept });
    },

    dropPassword(stepId) {
      set({ passwords: get().passwords.filter((p) => p.stepId !== stepId) });
    },
  };
});

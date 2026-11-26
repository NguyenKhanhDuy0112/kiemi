import { secretRef, suggestSecretName } from '@kiemi/recorder/pure';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useMutation } from '@tanstack/react-query';
import { Check, KeyRound, Lightbulb, Loader2, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { findStep, updateStep } from '../editor/doc-model';
import { useEditorStore } from '../editor/editor-store';
import { type PasswordPrompt, useRecordStore } from './record-store';

/** Live recording bar under the editor header: status, suggested checks, passwords [K-01, M-01, K-05]. */
export function RecordPanel({ testId }: { testId: string }) {
  const tx = useTx();
  const rec = useRecordStore();

  // Toasts for things that happen in the browser (registered once; `tx` read through a ref).
  const txRef = useRef(tx);
  txRef.current = tx;
  useEffect(() => {
    useRecordStore.setState({
      onNotice: (n) => {
        const t = txRef.current;
        if (n.kind === 'loginSaved') toast.success(t('ui.record.loginSaved', { name: n.name }));
        else if (n.count > 0)
          toast.success(t('ui.record.stopped', { count: n.count }), {
            description: t('ui.record.moreCasesHint'),
            action: {
              label: t('ui.record.moreCases'),
              onClick: () => useAppStore.getState().setView('forms'),
            },
          });
        else toast.success(t('ui.record.stopped', { count: n.count }));
      },
    });
  }, []);
  useEffect(() => {
    if (rec.state === 'error' && rec.error && rec.testId === testId) {
      toast.error(errorMessage(rec.error, tx));
      useRecordStore.setState({ state: 'idle', error: null });
    }
  }, [rec.state, rec.error, rec.testId, testId, tx]);

  if (rec.testId !== testId || rec.mode !== 'record' || !rec.recordingId) return null;

  return (
    <section
      aria-live="polite"
      aria-label={tx('ui.record.recording')}
      className="flex flex-col gap-2 border-b bg-primary/5 px-4 py-2 text-sm"
    >
      <div className="flex items-center gap-2">
        {rec.state === 'starting' ? (
          <>
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>
              {rec.download !== null
                ? tx('ui.record.download', { percent: Math.round(rec.download) })
                : tx('ui.record.starting')}
            </span>
          </>
        ) : (
          <>
            <span className="size-2.5 animate-pulse rounded-full bg-fail" aria-hidden />
            <strong>{tx('ui.record.recording')}</strong>
            <span className="text-muted-foreground">
              · {tx('ui.record.newSteps', { count: rec.recorded.length })}
            </span>
          </>
        )}
        <Button size="sm" variant="destructive" className="ml-auto" onClick={() => void rec.stop()}>
          <Square /> {tx('ui.record.stop')}
        </Button>
      </div>
      {rec.prefixFailed && (
        <p role="alert" className="text-warning-text">
          {tx('ui.record.prefixFailed')}
        </p>
      )}
      {rec.passwords.map((p) => (
        <PasswordRow key={p.stepId} prompt={p} environmentId={rec.environmentId} />
      ))}
      {rec.suggestions.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 font-medium">
            <Lightbulb className="size-4 text-warning-text" /> {tx('ui.record.suggestTitle')}
          </span>
          <ul className="flex flex-col gap-1">
            {rec.suggestions.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {tx(`ui.record.suggest.${s.kind}`, { text: s.text })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void rec.resolveSuggestion(s.id, true)}
                >
                  <Check className="text-pass-text" /> {tx('ui.record.accept')}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={tx('ui.record.dismiss')}
                  onClick={() => void rec.resolveSuggestion(s.id, false)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** "Lưu thành bí mật?" for a typed password [K-05]. */
function PasswordRow({
  prompt,
  environmentId,
}: {
  prompt: PasswordPrompt;
  environmentId: string | null;
}) {
  const tx = useTx();
  const doc = useEditorStore((s) => s.doc);
  const [name, setName] = useState(() => suggestSecretName(prompt.target));
  const setSecret = useMutation(trpc.environments.setSecret.mutationOptions());
  const drop = useRecordStore((s) => s.dropPassword);
  const stepNo = doc ? doc.steps.findIndex((s) => s.id === prompt.stepId) + 1 : 0;

  const save = async () => {
    if (!environmentId) return;
    try {
      await setSecret.mutateAsync({ id: environmentId, name, value: prompt.value });
      useEditorStore.getState().apply((d) => {
        const step = findStep(d, prompt.stepId);
        if (!step) return d;
        return updateStep(d, prompt.stepId, { params: { ...step.params, value: secretRef(name) } });
      });
      toast.success(tx('ui.record.secretSaved', { name }));
      drop(prompt.stepId);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <fieldset className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
      <KeyRound className="size-4 text-primary" />
      <span className="min-w-0 flex-1">
        {stepNo > 0 ? `${stepNo}. ` : ''}
        {tx('ui.record.password')}
      </span>
      {environmentId ? (
        <>
          <Input
            className="h-8 w-40"
            aria-label={tx('ui.record.secretName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)}
          >
            {tx('ui.record.saveSecret')}
          </Button>
        </>
      ) : (
        <span className="text-muted-foreground">{tx('ui.record.noEnvForSecret')}</span>
      )}
      <Button size="sm" variant="ghost" onClick={() => drop(prompt.stepId)}>
        {tx('ui.record.keepPlain')}
      </Button>
    </fieldset>
  );
}

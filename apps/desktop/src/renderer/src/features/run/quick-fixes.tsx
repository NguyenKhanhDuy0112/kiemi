import type { SimilarCandidate } from '@kiemi/engine';
import type { RunError } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { useTx } from '@renderer/lib/tx';
import { Clock, Crosshair, Hourglass, Search, Shield } from 'lucide-react';
import { useState } from 'react';

export type FailKind = 'notFound' | 'timeout' | 'blocked' | 'assertion' | 'network' | 'other';

/** What kind of failure this is, to offer the matching quick fixes [FX-06]. */
export function classifyFailure(error: Pick<RunError, 'code' | 'message'>): FailKind {
  switch (error.code) {
    case 'ELEMENT_NOT_FOUND':
    case 'ELEMENT_AMBIGUOUS':
      return 'notFound';
    case 'STEP_TIMEOUT':
    case 'CONDITION_TIMEOUT':
      return 'timeout';
    case 'ASSERTION_FAILED':
      return 'assertion';
    case 'HTTP_ERROR':
    case 'API_ERROR':
    case 'CONSOLE_ERROR':
      return 'network';
    default:
      // Something in front of the element (popup, overlay) takes the click.
      return /intercepts? pointer events|obscur|covered by|overlay/i.test(error.message)
        ? 'blocked'
        : 'other';
  }
}

export interface QuickFixActions {
  /** Only steps with a target element can pick another one. */
  hasTarget: boolean;
  busy: boolean;
  onRepick(): void;
  onSimilar(): Promise<SimilarCandidate[]>;
  onUseCandidate(c: SimilarCandidate): void;
  onWaitLonger(): void;
  onAddWaitStep(): void;
  onAddPopupRule(when: string, button: string): void;
}

/** Buttons that fix the usual cause of the failure in one click, then retry [FX-06]. */
export function QuickFixes({ kind, ...a }: { kind: FailKind } & QuickFixActions) {
  const tx = useTx();
  const [candidates, setCandidates] = useState<SimilarCandidate[] | null>(null);
  const [popup, setPopup] = useState<{ when: string; button: string } | null>(null);
  if (kind === 'other' || kind === 'assertion') return null;

  const showSimilar = async () => setCandidates(await a.onSimilar());

  return (
    <div className="flex flex-col gap-2 border-b bg-warning/10 px-4 py-3" data-fail-kind={kind}>
      <p className="text-xs font-medium">{tx(`ui.fix.hint.${kind}`)}</p>
      <div className="flex flex-wrap gap-1.5">
        {kind === 'notFound' && a.hasTarget && (
          <>
            <Button size="sm" variant="outline" disabled={a.busy} onClick={a.onRepick}>
              <Crosshair /> {tx('ui.fix.repick')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={a.busy}
              onClick={() => void showSimilar()}
            >
              <Search /> {tx('ui.fix.similar')}
            </Button>
          </>
        )}
        {(kind === 'notFound' || kind === 'timeout') && (
          <Button size="sm" variant="outline" disabled={a.busy} onClick={a.onWaitLonger}>
            <Clock /> {tx('ui.fix.waitLonger')}
          </Button>
        )}
        {kind === 'timeout' && (
          <Button size="sm" variant="outline" disabled={a.busy} onClick={a.onAddWaitStep}>
            <Hourglass /> {tx('ui.fix.addWaitStep')}
          </Button>
        )}
        {kind === 'blocked' && (
          <Button
            size="sm"
            variant="outline"
            disabled={a.busy}
            onClick={() => setPopup({ when: '', button: '' })}
          >
            <Shield /> {tx('ui.fix.addPopupRule')}
          </Button>
        )}
      </div>
      {candidates && (
        <ul className="flex flex-col gap-1" aria-label={tx('ui.fix.similar')}>
          {candidates.length === 0 && (
            <li className="text-xs text-muted-foreground">{tx('ui.fix.noSimilar')}</li>
          )}
          {candidates.map((c) => (
            <li key={JSON.stringify(c.locator.strategies)}>
              <Button
                size="sm"
                variant="ghost"
                className="h-auto w-full justify-start py-1 text-left"
                disabled={a.busy}
                onClick={() => a.onUseCandidate(c)}
              >
                {c.label} <span className="ml-auto text-xs text-muted-foreground">{c.score}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {popup && (
        <div className="flex flex-col gap-1.5">
          <Input
            aria-label={tx('ui.popups.when')}
            placeholder={tx('ui.fix.popupText')}
            value={popup.when}
            onChange={(e) => setPopup({ ...popup, when: e.target.value })}
          />
          <Input
            aria-label={tx('ui.popups.button')}
            placeholder={tx('ui.fix.popupButton')}
            value={popup.button}
            onChange={(e) => setPopup({ ...popup, button: e.target.value })}
          />
          <Button
            size="sm"
            disabled={a.busy || !popup.when.trim() || !popup.button.trim()}
            onClick={() => a.onAddPopupRule(popup.when.trim(), popup.button.trim())}
          >
            {tx('ui.fix.savePopupRule')}
          </Button>
        </div>
      )}
    </div>
  );
}

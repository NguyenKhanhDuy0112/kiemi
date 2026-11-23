import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { useTx } from '@renderer/lib/tx';
import { ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { create } from 'zustand';

interface ConfirmStore {
  pending: { name: string; resolve: (ok: boolean) => void } | null;
  /** Asks twice before a run on a protected environment [O-03, W-10]. */
  ask(name: string): Promise<boolean>;
  answer(ok: boolean): void;
}

export const useProtectedConfirm = create<ConfirmStore>((set, get) => ({
  pending: null,
  ask: (name) =>
    new Promise<boolean>((resolve) => {
      get().pending?.resolve(false);
      set({ pending: { name, resolve } });
    }),
  answer: (ok) => {
    get().pending?.resolve(ok);
    set({ pending: null });
  },
}));

/** Two steps: "I understand" → type the environment name [W-10]. */
export function ProtectedConfirmDialog() {
  const tx = useTx();
  const pending = useProtectedConfirm((s) => s.pending);
  const answer = useProtectedConfirm((s) => s.answer);
  const [stage, setStage] = useState<1 | 2>(1);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (pending) {
      setStage(1);
      setTyped('');
    }
  }, [pending]);
  const name = pending?.name ?? '';
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && answer(false)}>
      <DialogContent className="border-fail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fail-text">
            <ShieldAlert className="size-5" aria-hidden />
            {stage === 1
              ? tx('ui.run.confirmProtected.title1', { name })
              : tx('ui.run.confirmProtected.title2')}
          </DialogTitle>
          <DialogDescription>
            {stage === 1
              ? tx('ui.run.confirmProtected.text1')
              : tx('ui.run.confirmProtected.text2', { name })}
          </DialogDescription>
        </DialogHeader>
        {stage === 2 && (
          <form
            id="confirm-protected"
            className="flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (matches) answer(true);
            }}
          >
            <Label htmlFor="confirm-protected-name">{tx('ui.run.confirmProtected.typeName')}</Label>
            <Input
              id="confirm-protected-name"
              autoFocus
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </form>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(false)}>
            {tx('common.cancel')}
          </Button>
          {stage === 1 ? (
            <Button variant="destructive" onClick={() => setStage(2)}>
              {tx('ui.run.confirmProtected.continue')}
            </Button>
          ) : (
            <Button
              variant="destructive"
              type="submit"
              form="confirm-protected"
              disabled={!matches}
            >
              {tx('ui.run.confirmProtected.confirm', { name })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Textarea } from '@renderer/components/ui/textarea';
import { useTx } from '@renderer/lib/tx';
import { useState } from 'react';
import { planCombinations } from './combinations';

/** Builds the data table from parameter values: every combination, or pairwise [P-08]. */
export function CombinationsDialog({
  open,
  onClose,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  onUse: (columns: string[], rows: Record<string, string>[]) => void;
}) {
  const tx = useTx();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'all' | 'pairwise'>('pairwise');
  const plan = planCombinations(text, mode);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tx('ui.data.combosTitle')}</DialogTitle>
          <DialogDescription>{tx('ui.data.combosHint')}</DialogDescription>
        </DialogHeader>
        <Textarea
          rows={6}
          value={text}
          aria-label={tx('ui.data.combosTitle')}
          placeholder={tx('ui.data.combosExample')}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-4 text-sm">
          {(['pairwise', 'all'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input
                type="radio"
                name="combo-mode"
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              {tx(m === 'all' ? 'ui.data.combosAll' : 'ui.data.combosPairwise')}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground" data-testid="combos-count">
          {plan.tooMany
            ? tx('ui.data.combosTooMany', { count: plan.full })
            : tx('ui.data.combosCount', { rows: plan.rows.length, full: plan.full })}
        </p>
        <DialogFooter>
          <Button
            disabled={plan.rows.length === 0}
            onClick={() => {
              onUse(plan.columns, plan.rows);
              onClose();
            }}
          >
            {tx('ui.data.combosUse')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

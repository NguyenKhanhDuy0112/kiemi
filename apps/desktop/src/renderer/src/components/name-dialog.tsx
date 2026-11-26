import {
  labelsOf,
  QUALITY_CHARS,
  type QualityChar,
  TECHNIQUES,
  type Technique,
  withLabels,
} from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useTx } from '@renderer/lib/tx';
import { useEffect, useState } from 'react';

const NONE = '__none__';

export interface NameDialogState {
  title: string;
  initial: string;
  /** Show a tags field (tests). */
  tags?: string[];
  onSubmit(name: string, tags: string[]): void | Promise<void>;
}

/** Small dialog to name (and tag) something. */
export function NameDialog({
  state,
  onClose,
}: {
  state: NameDialogState | null;
  onClose: () => void;
}) {
  const tx = useTx();
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [technique, setTechnique] = useState<string>(NONE);
  const [quality, setQuality] = useState<string>(NONE);
  useEffect(() => {
    if (state) {
      setName(state.initial);
      const labels = labelsOf(state.tags ?? []);
      setTags(
        (state.tags ?? [])
          .filter((t) => !t.startsWith('technique:') && !t.startsWith('quality:'))
          .join(', '),
      );
      setTechnique(labels.technique ?? NONE);
      setQuality(labels.quality ?? NONE);
    }
  }, [state]);
  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!state || !name.trim()) return;
            await state.onSubmit(
              name.trim(),
              withLabels(
                tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
                {
                  technique: technique === NONE ? null : (technique as Technique),
                  quality: quality === NONE ? null : (quality as QualityChar),
                },
              ),
            );
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{state?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name-dialog-name">{tx('ui.tree.namePrompt')}</Label>
            <Input
              id="name-dialog-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>
          {state?.tags !== undefined && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name-dialog-tags">{tx('ui.tree.tags')}</Label>
              <Input
                id="name-dialog-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder={tx('ui.examples.tags')}
              />
            </div>
          )}
          {state?.tags !== undefined && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{tx('ui.labels.technique')}</Label>
                <Select value={technique} onValueChange={setTechnique}>
                  <SelectTrigger aria-label={tx('ui.labels.technique')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{tx('ui.labels.none')}</SelectItem>
                    {TECHNIQUES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {tx(`ui.labels.techniques.${t}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{tx('ui.labels.quality')}</Label>
                <Select value={quality} onValueChange={setQuality}>
                  <SelectTrigger aria-label={tx('ui.labels.quality')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{tx('ui.labels.none')}</SelectItem>
                    {QUALITY_CHARS.map((q) => (
                      <SelectItem key={q} value={q}>
                        {tx(`ui.labels.qualities.${q}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {tx('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {tx('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

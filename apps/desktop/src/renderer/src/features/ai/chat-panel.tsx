import { applyAccepted, diffParts, type Part } from '@kiemi/ai/review';
import { Button } from '@renderer/components/ui/button';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

type Chat = Awaited<ReturnType<typeof trpcClient.ai.chat.mutate>>;
type Proposal = NonNullable<Chat['proposal']>;
interface CaseRow {
  id: string;
  group: string;
  name: string;
  expected: string;
}
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  proposal?: Proposal | null;
  problems?: string[];
  /** Proposal already accepted or dismissed. */
  done?: boolean;
}

const stepLabel = (s: Record<string, unknown>): string =>
  `${String(s.action)} ${JSON.stringify(s.params ?? {}).slice(0, 80)}`;

/** The case table next to the chat: shows what changed and applies only the accepted parts [AI-18, AI-03]. */
function CasesCard({
  before,
  proposed,
  onApply,
}: {
  before: CaseRow[];
  proposed: CaseRow[];
  onApply(rows: CaseRow[]): void;
}) {
  const tx = useTx();
  const parts: Part<CaseRow>[] = diffParts(before, proposed, (c) => c.id);
  const [accepted, setAccepted] = useState<Set<string>>(
    () => new Set(parts.filter((p) => p.status !== 'same').map((p) => p.id)),
  );
  const toggle = (id: string) =>
    setAccepted((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  return (
    <div className="flex flex-col gap-2" data-testid="ai-cases">
      <ul className="flex flex-col gap-1 text-xs">
        {parts.map((p) => {
          const row = (p.after ?? p.before) as CaseRow;
          return (
            <li
              key={p.id}
              className={`flex items-start gap-2 rounded border p-1.5 ${
                p.status === 'added'
                  ? 'bg-pass-soft'
                  : p.status === 'removed'
                    ? 'bg-fail-soft line-through'
                    : p.status === 'changed'
                      ? 'bg-warning-soft'
                      : ''
              }`}
            >
              {p.status !== 'same' && (
                <input
                  type="checkbox"
                  aria-label={tx(`ui.ai.chat.part.${p.status}`)}
                  checked={accepted.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
              )}
              <span>
                <b>{row.group}</b> {row.name}
                {row.expected && <span className="text-muted-foreground"> → {row.expected}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <Button size="sm" onClick={() => onApply(applyAccepted(parts, accepted))}>
        {tx('ui.ai.chat.applyCases')}
      </Button>
    </div>
  );
}

/** Assistant chat in every screen [AI-13]: it only proposes, the person approves each change. */
export function ChatPanel() {
  const tx = useTx();
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const setAiOpen = useAppStore((s) => s.setAiOpen);
  const openTest = useAppStore((s) => s.openTest);
  const setView = useAppStore((s) => s.setView);
  const settings = useQuery({ ...trpc.ai.get.queryOptions({ projectId }), enabled: !!projectId });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    text: string;
    counts: string;
    tokens: number;
  } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const enabled = settings.data?.enabled === true;

  const showPreview = async () => {
    if (!input.trim()) return;
    try {
      const r = await trpcClient.ai.preview.query({ projectId, text: input });
      const hidden = Object.entries(r.redactions)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${tx(`ui.ai.chat.hidden.${k}`)}: ${n}`)
        .join(' · ');
      setPreview({ text: r.text, counts: hidden, tokens: r.estimatedTokens });
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setPreview(null);
    const history = msgs.map((m) => ({ role: m.role, content: m.text }));
    setMsgs((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const withTable = cases.length
        ? `${text}\n\n[Current case table]\n${JSON.stringify(cases)}`
        : text;
      const r = await trpcClient.ai.chat.mutate({ projectId, history, message: withTable });
      setMsgs((m) => [
        ...m,
        { role: 'assistant', text: r.reply, proposal: r.proposal, problems: r.problems },
      ]);
      setTimeout(() => endRef.current?.scrollIntoView?.({ block: 'end' }), 0);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    } finally {
      setBusy(false);
    }
  };

  const finish = (i: number) =>
    setMsgs((m) => m.map((x, j) => (j === i ? { ...x, done: true } : x)));

  const acceptTest = async (i: number, p: Extract<Proposal, { kind: 'test' }>) => {
    try {
      const r = await trpcClient.ai.acceptTest.mutate({
        projectId,
        name: p.name,
        steps: p.steps,
      });
      await qc.invalidateQueries();
      finish(i);
      toast.success(tx('ui.ai.chat.testSaved', { name: p.name }));
      setView('tests');
      openTest(r.id);
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  const acceptNote = async (i: number, text: string) => {
    try {
      const next = await trpcClient.ai.proposeNote.query({ projectId, text });
      await trpcClient.ai.saveNotes.mutate({ projectId, notes: next });
      await qc.invalidateQueries({ queryKey: trpc.ai.notes.queryKey({ projectId }) });
      finish(i);
      toast.success(tx('ui.ai.chat.noteSaved'));
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  return (
    <aside
      className="flex w-96 shrink-0 flex-col border-l bg-background"
      aria-label={tx('ui.ai.chat.title')}
      data-testid="ai-panel"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{tx('ui.ai.chat.title')}</span>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          aria-label={tx('ui.actions.close')}
          onClick={() => setAiOpen(false)}
        >
          <X />
        </Button>
      </div>

      {!enabled ? (
        <div className="flex flex-col gap-2 p-4 text-sm text-muted-foreground">
          <p>{tx('ui.ai.chat.off')}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setView('settings');
              setAiOpen(false);
            }}
          >
            {tx('ui.ai.chat.openSettings')}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {msgs.length === 0 && (
              <p className="text-xs text-muted-foreground">{tx('ui.ai.chat.empty')}</p>
            )}
            {msgs.map((m, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: messages are append-only.
                key={i}
                className={`flex flex-col gap-2 rounded-lg p-2 text-sm ${
                  m.role === 'user' ? 'ml-6 bg-muted' : 'mr-6 border'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.problems && m.problems.length > 0 && (
                  <p className="text-xs text-red-600">{m.problems.join('; ')}</p>
                )}
                {m.proposal && !m.done && (
                  <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
                    <span className="text-xs font-medium">{tx('ui.ai.chat.proposal')}</span>
                    {m.proposal.kind === 'test' && (
                      <>
                        <b className="text-xs">{m.proposal.name}</b>
                        <ol className="list-decimal pl-5 text-xs">
                          {m.proposal.steps.map((s, k) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: steps are shown in order.
                            <li key={k}>{stepLabel(s)}</li>
                          ))}
                        </ol>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              void acceptTest(i, m.proposal as Extract<Proposal, { kind: 'test' }>)
                            }
                          >
                            {tx('ui.ai.chat.saveTest')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => finish(i)}>
                            {tx('ui.ai.chat.dismiss')}
                          </Button>
                        </div>
                      </>
                    )}
                    {m.proposal.kind === 'cases' && (
                      <CasesCard
                        before={cases}
                        proposed={m.proposal.cases}
                        onApply={(rows) => {
                          setCases(rows);
                          finish(i);
                        }}
                      />
                    )}
                    {m.proposal.kind === 'note' && (
                      <>
                        <p className="text-xs">{m.proposal.text}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              void acceptNote(i, (m.proposal as { text: string }).text)
                            }
                          >
                            {tx('ui.ai.chat.saveNote')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => finish(i)}>
                            {tx('ui.ai.chat.dismiss')}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            {cases.length > 0 && (
              <div className="rounded-md border p-2" data-testid="ai-case-table">
                <span className="text-xs font-medium">
                  {tx('ui.ai.chat.caseTable', { count: cases.length })}
                </span>
                <ul className="mt-1 text-xs">
                  {cases.map((c) => (
                    <li key={c.id}>
                      <b>{c.group}</b> {c.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {busy && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> {tx('ui.ai.chat.thinking')}
              </p>
            )}
            <div ref={endRef} />
          </div>

          {preview && (
            <div className="border-t bg-muted/30 p-2 text-xs" data-testid="ai-preview">
              <p className="font-medium">{tx('ui.ai.chat.willSend', { tokens: preview.tokens })}</p>
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap">{preview.text}</pre>
              <p className="text-muted-foreground">
                {preview.counts || tx('ui.ai.chat.nothingHidden')}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2 border-t p-2">
            <textarea
              className="min-h-16 rounded-md border bg-background p-2 text-sm"
              value={input}
              placeholder={tx('ui.ai.chat.placeholder')}
              aria-label={tx('ui.ai.chat.placeholder')}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!input.trim()}
                onClick={() => void showPreview()}
              >
                <Eye /> {tx('ui.ai.chat.seeData')}
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                disabled={busy || !input.trim()}
                onClick={() => void send()}
              >
                <Send /> {tx('ui.ai.chat.send')}
              </Button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

import { type AiMessage, type AiTask, parseProposal } from '@kiemi/ai';
import { DbError, type Services } from '@kiemi/db';
import { buildKnowledge, checkSteps, createDefaultRegistry, knowledgeText } from '@kiemi/engine';
import { z } from 'zod';
import { gatewayFor, guardAndLog } from './gateway';
import { AI_TOOLS, runTool, toolsText } from './tools';

/** A case of a design table the person can edit by words or by hand [AI-18]. */
export const CaseRowSchema = z.object({
  id: z.string().min(1),
  group: z.string().max(100).default(''),
  name: z.string().min(1).max(300),
  expected: z.string().max(500).default(''),
});
export type CaseRow = z.infer<typeof CaseRowSchema>;

/** What the assistant proposes. Nothing is saved: the person accepts it in the panel [AI-03]. */
export const ProposalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('test'),
    name: z.string().min(1).max(300),
    steps: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
  }),
  z.object({ kind: z.literal('cases'), cases: z.array(CaseRowSchema).max(300) }),
  z.object({ kind: z.literal('note'), text: z.string().min(1).max(2000) }),
]);
export type Proposal = z.infer<typeof ProposalSchema>;

const EnvelopeSchema = z.union([
  z.object({ tool: z.string().min(1), args: z.unknown().optional() }),
  z.object({ reply: z.string(), proposal: ProposalSchema.nullish() }),
]);

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  reply: string;
  proposal: Proposal | null;
  /** Problems found in the proposal that the assistant could not fix. */
  problems: string[];
  toolsUsed: string[];
  cached: boolean;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * The person pressed "save as test" on a proposal: creates the test. Steps are checked
 * again against the catalog, and the approval is logged [AI-03, AI-21].
 */
export function acceptTest(
  services: Services,
  projectId: string,
  name: string,
  steps: unknown,
): { id: string } {
  const problems = checkSteps(registry, steps);
  if (problems.length)
    throw new DbError('VALIDATION', problems.map((p) => `step ${p.at}: ${p.message}`).join('; '), {
      entity: 'test case',
    });
  guardAndLog(services, projectId, { kind: 'save' }, { approved: true }, `test ${name}`);
  const row = services.testCases.create({ projectId, name });
  services.testCases.save(row.id, { ...row.content, steps }, row.version);
  return { id: row.id };
}

const MAX_TOOL_ROUNDS = 4;
const MAX_FIX_ROUNDS = 1;

const registry = createDefaultRegistry();

/** System prompt: who the assistant is, the catalog it may build from, the tools, the notes. */
export function systemPrompt(services: Services, projectId: string, extra = ''): string {
  const notes = services.projects.notes(projectId).trim();
  return [
    'You are Kiemi Assistant, inside a no-code UI test tool for testers who cannot code. Answer in Vietnamese, short and plain.',
    'Reply with ONE JSON object and nothing else. Either {"tool": name, "args": {...}} to look something up, or {"reply": "text for the person", "proposal": null | proposal}.',
    'A proposal is one of: {"kind":"test","name":string,"steps":[step...]} | {"kind":"cases","cases":[{"id","group","name","expected"}]} | {"kind":"note","text":string}. Return the FULL list of cases each time you change it.',
    'You never save, delete or run anything: the person reviews every proposal. Ask a question in "reply" when a rule is missing instead of guessing.',
    knowledgeText(buildKnowledge(registry)),
    `Lookup tools:\n${toolsText()}`,
    notes ? `Project notes (follow them):\n${notes}` : '',
    extra,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * One chat message → one answer, running lookups and fixing a bad proposal on the way.
 * Everything goes through the project's gateway (redaction, limits, cache) [AI-02, AI-13].
 */
export async function chat(
  services: Services,
  projectId: string,
  history: ChatTurn[],
  message: string,
  opts: { task?: AiTask; context?: string } = {},
): Promise<ChatResult> {
  const gateway = gatewayFor(services, projectId);
  const system = systemPrompt(
    services,
    projectId,
    opts.context ? `Page the person is looking at:\n${opts.context}` : '',
  );
  const messages: AiMessage[] = [...history, { role: 'user', content: message }];
  const toolsUsed: string[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let cached = true;
  let fixes = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS + MAX_FIX_ROUNDS + 2; round++) {
    const res = await gateway.ask({ task: opts.task ?? 'chat', system, messages });
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    cached = cached && res.cached;

    const env = parseProposal(res.text, EnvelopeSchema);
    // A model that ignores the format still gets heard: plain text becomes the reply.
    if (!env.ok)
      return { reply: res.text.trim(), proposal: null, problems: [], toolsUsed, cached, usage };

    if ('tool' in env.value) {
      const name = env.value.tool;
      if (toolsUsed.length >= MAX_TOOL_ROUNDS || !AI_TOOLS.some((t) => t.name === name)) {
        messages.push(
          { role: 'assistant', content: res.text },
          {
            role: 'user',
            content: `Tool "${name}" is not available now. Answer with what you know.`,
          },
        );
        continue;
      }
      let out: string;
      try {
        out = runTool(services, projectId, name, env.value.args);
      } catch (e) {
        out = `Error: ${e instanceof Error ? e.message : 'failed'}`;
      }
      toolsUsed.push(name);
      guardAndLog(services, projectId, { kind: 'read' }, { approved: false }, `tool ${name}`);
      messages.push(
        { role: 'assistant', content: res.text },
        { role: 'user', content: `TOOL RESULT ${name}:\n${out}` },
      );
      continue;
    }

    const proposal = env.value.proposal ?? null;
    const problems =
      proposal?.kind === 'test'
        ? checkSteps(registry, proposal.steps).map((p) => `step ${p.at}: ${p.message}`)
        : [];
    if (problems.length && fixes < MAX_FIX_ROUNDS) {
      fixes++;
      messages.push(
        { role: 'assistant', content: res.text },
        {
          role: 'user',
          content: `The proposal has problems, fix them and answer again:\n${problems.join('\n')}`,
        },
      );
      continue;
    }
    if (proposal) guardAndLog(services, projectId, { kind: 'propose' }, { approved: false });
    return {
      reply: env.value.reply,
      proposal: problems.length ? null : proposal,
      problems,
      toolsUsed,
      cached,
      usage,
    };
  }
  return {
    reply: '',
    proposal: null,
    problems: ['The assistant did not finish'],
    toolsUsed,
    cached,
    usage,
  };
}

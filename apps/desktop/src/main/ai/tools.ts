import type { Services } from '@kiemi/db';
import { DbError } from '@kiemi/db';
import { z } from 'zod';
import { guardAndLog } from './gateway';

/** Longest answer a tool gives back, so one lookup cannot fill the prompt. */
const MAX_CHARS = 20_000;
const MAX_ITEMS = 50;

interface ToolDef {
  name: string;
  description: string;
  input: z.ZodType;
  run(services: Services, projectId: string, args: never): unknown;
}

const tool = <S extends z.ZodType>(
  name: string,
  description: string,
  input: S,
  run: (services: Services, projectId: string, args: z.output<S>) => unknown,
): ToolDef => ({ name, description, input, run: run as ToolDef['run'] });

const has = (text: string, q: string | undefined): boolean =>
  !q || text.toLowerCase().includes(q.toLowerCase());

/**
 * Read-only lookups the assistant may call about the open project [AI-16]. Secrets are never
 * returned: environments give names only.
 */
export const AI_TOOLS: ToolDef[] = [
  tool(
    'listTests',
    'List tests of the project. `query` keeps tests whose name or steps contain the text (e.g. a button label).',
    z.object({ query: z.string().max(200).optional() }),
    (s, p, a) => {
      const rows = s.testCases.list(p).filter((t) => {
        if (!a.query) return true;
        if (has(t.name, a.query)) return true;
        return has(JSON.stringify(s.testCases.get(t.id).content.steps), a.query);
      });
      return rows
        .slice(0, MAX_ITEMS)
        .map((t) => ({ id: t.id, name: t.name, steps: t.stepCount, tags: t.tags ?? [] }));
    },
  ),
  tool(
    'getTest',
    'Get one test with all its steps.',
    z.object({ id: z.string().min(1) }),
    (s, p, a) => {
      const t = s.testCases.get(a.id);
      if (t.projectId !== p)
        throw new DbError('NOT_FOUND', 'Test not found', { entity: 'test case' });
      return { id: t.id, name: t.name, content: t.content };
    },
  ),
  tool(
    'searchElements',
    'Search the element library by name.',
    z.object({ query: z.string().max(200).optional() }),
    (s, p, a) =>
      s.elements
        .list(p)
        .filter((e) => has(e.name, a.query))
        .slice(0, MAX_ITEMS)
        .map((e) => ({ id: e.id, name: e.name, pageUrl: e.pageUrl, locator: e.locator })),
  ),
  tool(
    'getFieldSpec',
    'Get form specifications (fields and rules). `name` keeps forms whose name contains the text.',
    z.object({ name: z.string().max(200).optional() }),
    (s, p, a) => s.projects.formSpecs(p).filter((f) => has(f.name, a.name)),
  ),
  tool(
    'getEnv',
    'List the environments of the project: addresses and variables, secret NAMES only.',
    z.object({}),
    (s, p) =>
      s.environments.list(p).map((e) => {
        const env = s.environments.envOf(e.id);
        return { ...env, id: e.id };
      }),
  ),
  tool(
    'getRunHistory',
    'The latest runs of the project with their status.',
    z.object({ limit: z.number().int().min(1).max(30).default(10) }),
    (s, p, a) =>
      s.runs
        .list(p)
        .slice(-a.limit)
        .reverse()
        .map((r) => ({
          id: r.id,
          status: r.status,
          startedAt: r.startedAt,
          durationMs: r.durationMs,
          trigger: r.trigger,
        })),
  ),
  tool('getRequirements', 'Requirements / tickets of the project.', z.object({}), (s, p) =>
    s.projects.requirements(p),
  ),
  tool('getProjectNotes', 'Notes the team wrote for the assistant.', z.object({}), (s, p) =>
    s.projects.notes(p),
  ),
];

export type AiToolName = (typeof AI_TOOLS)[number]['name'];

/** The tools as text for the system prompt. */
export function toolsText(): string {
  return AI_TOOLS.map(
    (t) =>
      `- ${t.name}(${JSON.stringify(z.toJSONSchema(t.input).properties ?? {})}): ${t.description}`,
  ).join('\n');
}

/** Runs one tool for a project. Unknown names and bad arguments throw; the answer is cut. */
export function runTool(
  services: Services,
  projectId: string,
  name: string,
  args: unknown,
): string {
  const def = AI_TOOLS.find((t) => t.name === name);
  if (!def) throw new DbError('VALIDATION', `Unknown tool "${name}"`, { entity: 'ai tool' });
  const parsed = def.input.safeParse(args ?? {});
  if (!parsed.success)
    throw new DbError('VALIDATION', parsed.error.issues.map((i) => i.message).join('; '), {
      entity: 'ai tool',
    });
  const out = def.run(services, projectId, parsed.data as never);
  const text = typeof out === 'string' ? out : JSON.stringify(out);
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…(cut)` : text;
}

/** "Remember that…": the notes as they would be after adding `text`. Nothing is saved. */
export function proposeNote(services: Services, projectId: string, text: string): string {
  const old = services.projects.notes(projectId).trimEnd();
  return `${old ? `${old}\n` : ''}- ${text.trim()}\n`;
}

/** Saves notes the person approved. Without approval it is blocked and logged [AI-20, AI-21]. */
export function saveNotes(
  services: Services,
  projectId: string,
  notes: string,
  approved: boolean,
): void {
  guardAndLog(services, projectId, { kind: 'save' }, { approved }, 'project notes');
  services.projects.setNotes(projectId, notes);
}

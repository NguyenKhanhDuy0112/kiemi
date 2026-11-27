import { DbError, readExcel, type Services } from '@kiemi/db';
import { readPdfText } from '@kiemi/engine';
import type { RunError } from '@kiemi/schema';
import { type ChatResult, chat } from './assistant';
import { gatewayFor } from './gateway';

const MAX_DOC_CHARS = 40_000;

/** AI-05: plain sentences in → steps for the page open in the browser, as a proposal to review. */
export function describeToSteps(
  s: Services,
  projectId: string,
  description: string,
  pageText?: string,
): Promise<ChatResult> {
  const message = [
    'Turn these sentences into one test: a "test" proposal made only of catalog actions.',
    'When you are not sure which element a sentence means, still write the step with your best guess and set its "note" to "PICK: <what to pick>" so the person can Pick it on the page.',
    'End with an assertion that proves the result.',
    `Sentences:\n${description}`,
  ].join('\n');
  return chat(s, projectId, [], message, {
    task: 'write',
    ...(pageText ? { context: pageText } : {}),
  });
}

/** Text of an uploaded document: .xlsx, .csv/.txt/.md, .pdf (Word is not supported yet). */
export async function documentText(name: string, bytes: Uint8Array): Promise<string> {
  const lower = name.toLowerCase();
  let text: string;
  if (lower.endsWith('.xlsx')) {
    const t = await readExcel(bytes);
    text = [
      t.columns.join(' | '),
      ...t.rows.map((r) => t.columns.map((c) => r[c] ?? '').join(' | ')),
    ].join('\n');
  } else if (lower.endsWith('.pdf')) text = await readPdfText(bytes);
  else if (/\.(csv|txt|md)$/.test(lower)) text = new TextDecoder().decode(bytes);
  else
    throw new DbError(
      'IMPORT_FAILED',
      'Unsupported document type (use .xlsx, .pdf, .csv, .txt or .md)',
      {
        reason: 'badDocument',
      },
    );
  return text.length > MAX_DOC_CHARS ? `${text.slice(0, MAX_DOC_CHARS)}\n…(cut)` : text;
}

/** AI-06: a test-case sheet or a requirements document → a table of cases to review. */
export function casesFromDocument(
  s: Services,
  projectId: string,
  name: string,
  text: string,
): Promise<ChatResult> {
  const message = [
    `Read the document "${name}" (test cases or requirements). Answer with a "cases" proposal: one row per test case — id, group, name, expected.`,
    'Keep the document\'s own wording and numbering when it has test cases; derive cases from the rules when it is a requirements document. Mention in "reply" what the document leaves unclear.',
    `[Document]\n${text}`,
  ].join('\n');
  return chat(s, projectId, [], message, { task: 'write' });
}

/** AI-11: a bug report in Markdown for a failed step, ready to paste in a tracker. */
export async function writeBugReport(
  s: Services,
  projectId: string,
  input: {
    testCaseId: string;
    stepId: string;
    error: Pick<RunError, 'code' | 'message'>;
    environmentName?: string | null;
  },
): Promise<string> {
  const t = s.testCases.get(input.testCaseId);
  if (t.projectId !== projectId)
    throw new DbError('NOT_FOUND', 'Test not found', { entity: 'test case' });
  const res = await gatewayFor(s, projectId).ask({
    task: 'write',
    system:
      'You write bug reports for testers, in Vietnamese Markdown: title, environment, steps to reproduce (numbered, plain words), expected result, actual result, severity guess. Do not invent facts that are not given.',
    messages: [
      {
        role: 'user',
        content: [
          `Test: ${t.name}`,
          `Environment: ${input.environmentName ?? 'unknown'}`,
          `Failed step id: ${input.stepId}`,
          `Error: ${input.error.code} — ${input.error.message}`,
          `Steps: ${JSON.stringify(t.content.steps.map((x) => ({ id: x.id, action: x.action, params: x.params }))).slice(0, 8000)}`,
        ].join('\n'),
      },
    ],
  });
  return res.text.trim();
}

/** AI-11: a short summary of a run (what passed, what failed and why, what to do next). */
export async function summarizeRun(s: Services, projectId: string, runId: string): Promise<string> {
  const run = s.runs.get(runId);
  if (run.projectId !== projectId)
    throw new DbError('NOT_FOUND', 'Run not found', { entity: 'run' });
  const names = new Map(s.testCases.list(projectId).map((t) => [t.id, t.name]));
  const lines = s.runs
    .listCases(runId)
    .map(
      (c) =>
        `${c.status.toUpperCase()}: ${names.get(c.testCaseId) ?? c.testCaseId}${c.error ? ` — ${c.error.message}` : ''}`,
    );
  const res = await gatewayFor(s, projectId).ask({
    task: 'write',
    system:
      'You summarise a test run for a QA lead, in Vietnamese, at most 8 lines: overall result, the failures grouped by likely cause, and what to do next. Use only the data given.',
    messages: [
      {
        role: 'user',
        content: `Run status: ${run.status}, duration ${run.durationMs ?? '?'} ms.\n${lines.slice(0, 200).join('\n')}`,
      },
    ],
  });
  return res.text.trim();
}

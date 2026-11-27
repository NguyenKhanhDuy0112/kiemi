import type { Services } from '@kiemi/db';
import { type ReqTest, requirementCoverage } from '@kiemi/schema';
import { coverageOf } from '../api/routers/coverage';
import { type ChatResult, chat } from './assistant';

const MAX_NAMES = 60;

/** Newest run first: the first status seen for a test is its latest. */
function lastStatuses(s: Services, projectId: string): Map<string, string> {
  const last = new Map<string, string>();
  for (const run of s.runs.history(projectId, { limit: 300 })) {
    for (const c of s.runs.listCases(run.id)) {
      if (!last.has(c.testCaseId) && ['passed', 'failed', 'error'].includes(c.status))
        last.set(c.testCaseId, c.status);
    }
  }
  return last;
}

/**
 * What the project is missing, in words: checklist groups no test covers, pages without
 * tests, requirements without tests, failing tests, and the tests that exist [AI-19].
 */
export function gapsText(s: Services, projectId: string): string {
  const { coverage } = coverageOf(s, projectId);
  const last = lastStatuses(s, projectId);
  const tests = s.testCases.list(projectId);
  const reqTests: ReqTest[] = tests.map((t) => ({
    id: t.id,
    name: t.name,
    tags: t.tags,
    lastStatus: last.get(t.id) ?? null,
  }));
  const reqs = requirementCoverage(s.projects.requirements(projectId), reqTests);

  const lines: string[] = [];
  for (const p of coverage.pages) {
    const missing = p.groups.filter((g) => !g.covered).map((g) => g.group);
    if (missing.length)
      lines.push(`Page ${p.page.path} (${p.page.kind}): no test for ${missing.join(', ')}`);
  }
  if (coverage.untested.length)
    lines.push(`Pages without any test: ${coverage.untested.map((p) => p.path).join(', ')}`);
  const noReq = reqs.rows.filter((r) => r.state === 'none').map((r) => r.requirement.key);
  if (noReq.length) lines.push(`Requirements without tests: ${noReq.join(', ')}`);
  const failing = tests.filter((t) => ['failed', 'error'].includes(last.get(t.id) ?? ''));
  if (failing.length) lines.push(`Tests failing now: ${failing.map((t) => t.name).join('; ')}`);
  const forms = s.projects.formSpecs(projectId).map((f) => f.name);
  if (forms.length) lines.push(`Forms of the project: ${forms.join(', ')}`);
  lines.push(
    `Existing tests (do not repeat): ${
      tests
        .slice(0, MAX_NAMES)
        .map((t) => t.name)
        .join('; ') || '(none)'
    }`,
  );
  return lines.join('\n');
}

export type SuggestMode = 'missing' | 'business';

const ASK: Record<SuggestMode, string> = {
  missing:
    'Suggest the test cases still missing. Use the gaps below (checklist groups, pages, requirements, failures). Answer with a "cases" proposal: id, group, name, expected. Put the reason in "reply".',
  business:
    'Suggest extra business-rule cases (beyond field validation) for the forms and flows of this project: states, permissions, limits, duplicates, time rules. Answer with a "cases" proposal: id, group, name, expected.',
};

/** Asks the assistant for more cases; the answer is a proposal the person reviews [AI-19, AI-08]. */
export function suggestCases(
  s: Services,
  projectId: string,
  mode: SuggestMode,
  context?: string,
): Promise<ChatResult> {
  const message = `${ASK[mode]}\n\n[Project gaps]\n${gapsText(s, projectId)}`;
  return chat(s, projectId, [], message, {
    task: 'design',
    ...(context ? { context } : {}),
  });
}

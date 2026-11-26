import type { Step } from '@kiemi/schema';

/** What a check expected and what the page had, when an assertion failed [FX-07]. */
export interface Mismatch {
  expected: string;
  actual: string;
}

export function mismatchOf(details: Record<string, unknown> | undefined): Mismatch | undefined {
  if (!details || typeof details.expected !== 'string' || typeof details.actual !== 'string')
    return undefined;
  return { expected: details.expected, actual: details.actual };
}

/**
 * The step params that turn the failed check into one that passes with what the
 * page really showed. Only checks with a plain value qualify; ranges, dates and
 * messages the page did not show are left to the tester [FX-07].
 */
export function expectationUpdate(
  step: Pick<Step, 'action' | 'params'>,
  actual: string,
): Record<string, unknown> | undefined {
  switch (step.action) {
    case 'assertText':
    case 'assertValue':
    case 'assertTitle':
    case 'assertVariable':
    case 'assertTable':
      return { ...step.params, value: actual };
    case 'assertCount': {
      const n = Number(actual);
      return Number.isFinite(n) ? { ...step.params, value: n } : undefined;
    }
    case 'assertToast':
      return actual === '(no message)' ? undefined : { ...step.params, text: actual };
    default:
      return undefined;
  }
}

export interface BugReportInput {
  testName: string;
  environment?: string | null;
  /** Reproduction steps up to and including the failed one, already in words. */
  steps: string[];
  /** 1-based position of the failed step in `steps`. */
  failedAt: number;
  error: string;
  mismatch?: Mismatch | undefined;
  /** Screenshot file names of the failed step. */
  screenshots?: string[];
  labels: {
    title: string;
    environment: string;
    steps: string;
    expected: string;
    actual: string;
    error: string;
    screenshots: string;
  };
}

/** Markdown that pastes cleanly into Jira / Redmine / GitHub [X-02]. */
export function buildBugReport(i: BugReportInput): string {
  const l = i.labels;
  const lines = [`## ${l.title.replace('{{test}}', i.testName)}`, ''];
  if (i.environment) lines.push(`**${l.environment}:** ${i.environment}`, '');
  lines.push(`**${l.steps}:**`);
  i.steps.forEach((s, n) => {
    lines.push(`${n + 1}. ${s}${n + 1 === i.failedAt ? ' ← ✗' : ''}`);
  });
  lines.push('');
  if (i.mismatch) {
    lines.push(
      `**${l.expected}:** ${i.mismatch.expected}`,
      `**${l.actual}:** ${i.mismatch.actual}`,
    );
  } else {
    lines.push(`**${l.error}:** ${i.error}`);
  }
  if (i.screenshots?.length) lines.push('', `**${l.screenshots}:** ${i.screenshots.join(', ')}`);
  return `${lines.join('\n')}\n`;
}

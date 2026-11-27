import type { RunError, TestCase } from '@kiemi/schema';
import { describeRunError } from '@kiemi/shared';
import { toast } from 'sonner';
import { stepText } from '../editor/describe';
import { flatten } from '../editor/doc-model';
import { buildBugReport, mismatchOf } from './bug-report';

type Tx = (key: string, vars?: Record<string, unknown>, fallback?: string) => string;

/** Markdown bug report of the failed step [X-02]. */
export function bugMarkdown(input: {
  doc: TestCase;
  stepId: string;
  error: RunError;
  environmentName?: string | null | undefined;
  screenshots?: string[] | undefined;
  sharedNames?: ReadonlyMap<string, string>;
  tx: Tx;
}): string {
  const { doc, tx } = input;
  const rows = flatten(doc).filter((r) => !r.no.startsWith('C'));
  const at = rows.findIndex((r) => r.step.id === input.stepId);
  const upTo = at < 0 ? rows : rows.slice(0, at + 1);
  return buildBugReport({
    testName: doc.name,
    environment: input.environmentName ?? null,
    steps: upTo.map((r) => stepText(r.step, doc.elements, tx, input.sharedNames)),
    failedAt: upTo.length,
    error: describeRunError(input.error, tx).message,
    mismatch: mismatchOf(input.error.details),
    ...(input.screenshots?.length ? { screenshots: input.screenshots } : {}),
    labels: {
      title: tx('ui.bug.title'),
      environment: tx('ui.bug.environment'),
      steps: tx('ui.bug.steps'),
      expected: tx('ui.bug.expected'),
      actual: tx('ui.bug.actual'),
      error: tx('ui.bug.error'),
      screenshots: tx('ui.bug.screenshots'),
    },
  });
}

/** Copies a Markdown bug report for the failed step to the clipboard [X-02]. */
export async function copyBugReport(input: Parameters<typeof bugMarkdown>[0]): Promise<void> {
  const { tx } = input;
  const md = bugMarkdown(input);
  try {
    await navigator.clipboard.writeText(md);
    toast.success(tx('ui.bug.copied'));
  } catch {
    toast.error(tx('ui.bug.copyFailed'));
  }
}

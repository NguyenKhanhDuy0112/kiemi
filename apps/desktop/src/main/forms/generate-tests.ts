import type { Services } from '@kiemi/db';
import {
  caseSteps,
  caseTestName,
  expectedError,
  formCaseTag,
  generateFormCases,
  labelsOfCase,
  withLabels,
} from '@kiemi/schema';

export interface GenerateResult {
  folderId: string;
  created: number;
  /** Tests that already existed with the same name in the folder (kept as they are). */
  skipped: number;
}

/**
 * Turns the ticked cases of a form into test cases in a folder named after the
 * form; running it again only adds what is missing [R-03].
 */
export function generateFormTests(
  s: Services,
  input: { projectId: string; formId: string; caseIds: string[] },
): GenerateResult {
  const form = s.projects.formSpecs(input.projectId).find((f) => f.id === input.formId);
  if (!form) throw new Error('Form specification not found');
  const catalog = s.projects.messageCatalog(input.projectId);
  const wanted = new Set(input.caseIds);
  const cases = generateFormCases(form).filter((c) => wanted.has(c.id));

  const folder =
    s.folders
      .list(input.projectId)
      .find(
        (f) =>
          f.name === form.name &&
          !f.parentId &&
          (!form.productId || f.productId === form.productId),
      ) ??
    s.folders.create({
      projectId: input.projectId,
      name: form.name,
      ...(form.productId ? { productId: form.productId } : {}),
    });
  const existing = new Set(s.testCases.list(input.projectId, folder.id).map((t) => t.name));

  let created = 0;
  let skipped = 0;
  for (const c of cases) {
    const name = caseTestName(form, c);
    if (existing.has(name)) {
      skipped++;
      continue;
    }
    const row = s.testCases.create({ projectId: input.projectId, folderId: folder.id, name });
    const message = expectedError(form, c, catalog);
    s.testCases.save(row.id, {
      ...row.content,
      description: [c.why, message ? `Kỳ vọng thông báo: "${message}"` : null]
        .filter(Boolean)
        .join('\n'),
      tags: withLabels(
        [
          'form-validation',
          c.expect === 'reject' ? 'negative' : 'positive',
          formCaseTag(form.id, c.id),
        ],
        labelsOfCase(c.technique, c.id),
      ),
      steps: caseSteps(form, c, catalog),
    });
    created++;
  }
  return { folderId: folder.id, created, skipped };
}

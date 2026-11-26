import type { Services } from '@kiemi/db';
import { permissionSteps, permTag, permTestName } from '@kiemi/schema';

export interface PermissionGenerateResult {
  folderId: string;
  created: number;
  /** Tests rewritten because a test of this matrix and role already existed. */
  updated: number;
}

/**
 * One test per role of a matrix, in a folder named after the matrix [Q-09].
 * Running it again rewrites the steps of the same test (found by its tag), so an edited matrix
 * never leaves two copies.
 */
export function generatePermissionTests(
  s: Services,
  input: { projectId: string; matrixId: string },
): PermissionGenerateResult {
  const m = s.projects.permissionMatrices(input.projectId).find((x) => x.id === input.matrixId);
  if (!m) throw new Error('Permission matrix not found');
  const folder =
    s.folders.list(input.projectId).find((f) => f.name === m.name && !f.parentId) ??
    s.folders.create({ projectId: input.projectId, name: m.name });
  const existing = s.testCases.list(input.projectId, folder.id).map((t) => s.testCases.get(t.id));
  let created = 0;
  let updated = 0;
  for (const role of m.roles) {
    const tag = `${permTag(m.id)}|${role.key}`;
    const found = existing.find((t) => t.content.tags.includes(tag));
    const row =
      found ??
      s.testCases.create({
        projectId: input.projectId,
        folderId: folder.id,
        name: permTestName(m, role),
      });
    s.testCases.save(
      row.id,
      {
        ...row.content,
        name: permTestName(m, role),
        description: `Kiểm tra vai trò "${role.name}": menu hiện đúng chức năng và gõ thẳng địa chỉ thì vào được / bị chặn đúng như ma trận.`,
        tags: [...new Set([...row.content.tags, 'permission', permTag(m.id), tag])],
        steps: permissionSteps(m, role),
      },
      found ? found.version : row.version,
    );
    if (found) updated++;
    else created++;
  }
  return { folderId: folder.id, created, updated };
}

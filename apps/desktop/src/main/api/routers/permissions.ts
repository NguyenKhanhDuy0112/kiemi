import { matrixFromTable, PERMISSION_TEMPLATE, readExcel, writeExcel } from '@kiemi/db';
import { z } from 'zod';
import { generatePermissionTests } from '../../permissions/generate-tests';
import { publicProcedure, router } from '../trpc';

/** Permission matrix: sample file, Excel import, test generation [Q-09]. */
export const permissionsRouter = router({
  template: publicProcedure.query(async () => ({
    data: Buffer.from(await writeExcel(PERMISSION_TEMPLATE, 'Phân quyền')).toString('base64'),
  })),

  /** Reads the file into a matrix to review; nothing is saved here. */
  fromExcel: publicProcedure
    .input(
      z.object({
        data: z.string().max(50 * 1024 * 1024),
        fileName: z.string().max(260),
        sheet: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const table = await readExcel(new Uint8Array(Buffer.from(input.data, 'base64')), input.sheet);
      const name = input.fileName.replace(/\.xlsx$/i, '') || table.sheet;
      return matrixFromTable(table, name, `perm-${Date.now().toString(36)}`);
    }),

  /** One test per role of a saved matrix. */
  generate: publicProcedure
    .input(z.object({ projectId: z.string().min(1), matrixId: z.string().min(1) }))
    .mutation(({ ctx, input }) => generatePermissionTests(ctx.services, input)),
});

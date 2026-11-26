import {
  casesFromTable,
  detectMapping,
  excelSheets,
  MANUAL_FIELDS,
  MANUAL_TEMPLATE,
  readExcel,
  writeExcel,
} from '@kiemi/db';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/** Import of manual test cases from Excel [X-08]. */
export const manualRouter = router({
  /** Sample .xlsx (base64): one row per step. */
  template: publicProcedure.query(async () => ({
    data: Buffer.from(await writeExcel(MANUAL_TEMPLATE, 'Case')).toString('base64'),
  })),

  /** Reads the file and shows what would be imported; nothing is saved here. */
  preview: publicProcedure
    .input(
      z.object({
        data: z.string().max(50 * 1024 * 1024),
        sheet: z.string().optional(),
        /** Column the person picked for each field ("" = none); omitted = guess from headers. */
        mapping: z.partialRecord(z.enum(MANUAL_FIELDS), z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const bytes = new Uint8Array(Buffer.from(input.data, 'base64'));
      const [sheets, table] = await Promise.all([
        excelSheets(bytes),
        readExcel(bytes, input.sheet),
      ]);
      const mapping = input.mapping
        ? Object.fromEntries(Object.entries(input.mapping).filter(([, col]) => col !== ''))
        : detectMapping(table.columns);
      return {
        sheets,
        sheet: table.sheet,
        columns: table.columns,
        mapping,
        ...casesFromTable(table, mapping),
      };
    }),
});

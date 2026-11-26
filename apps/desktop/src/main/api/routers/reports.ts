import { writeWorkbook } from '@kiemi/db';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

const cell = z.union([z.string().max(32_000), z.number()]);

/** Report files: Excel workbook and PDF [X-01]. */
export const reportsRouter = router({
  /** Sheets built by the screen → .xlsx (base64). */
  workbook: publicProcedure
    .input(
      z.object({
        sheets: z
          .array(
            z.object({
              name: z.string().min(1).max(100),
              intro: z.array(z.array(cell).max(20)).max(500).optional(),
              columns: z.array(z.string().max(200)).min(1).max(50),
              rows: z.array(z.array(cell).max(50)).max(100_000),
            }),
          )
          .min(1)
          .max(10),
      }),
    )
    .mutation(async ({ input }) => ({
      data: Buffer.from(
        await writeWorkbook(
          input.sheets.map((s) => ({
            name: s.name,
            columns: s.columns,
            rows: s.rows,
            ...(s.intro ? { intro: s.intro } : {}),
          })),
        ),
      ).toString('base64'),
    })),

  /** The HTML report → PDF (base64). Needs the desktop app (not available in tests). */
  pdf: publicProcedure
    .input(
      z.object({
        html: z
          .string()
          .min(1)
          .max(60 * 1024 * 1024),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.desktop)
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'PDF needs the desktop app' });
      return { data: Buffer.from(await ctx.desktop.htmlToPdf(input.html)).toString('base64') };
    }),
});

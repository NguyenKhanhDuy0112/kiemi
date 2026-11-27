import { FIELD_SPEC_TEMPLATE, formFromTable, readExcel, writeExcel } from '@kiemi/db';
import { formSpecsFromSchema, inferForm, pageContextText } from '@kiemi/engine';
import { elementCoverage, LocatorSchema, usedStrategies } from '@kiemi/schema';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { generateFormTests } from '../../forms/generate-tests';
import { type RecorderManager, StartRecordingInputSchema } from '../../record/recorder-manager';
import { publicProcedure, router } from '../trpc';

const recordingId = z.object({ recordingId: z.string().min(1) });

function manager(ctx: { recorder?: RecorderManager | undefined }) {
  if (!ctx.recorder) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No recorder' });
  return ctx.recorder;
}

/** Record steps in a visible browser; Pick / Highlight elements [M5]. */
export const recorderRouter = router({
  start: publicProcedure
    .input(StartRecordingInputSchema)
    .mutation(({ ctx, input }) => manager(ctx).start(input)),

  stop: publicProcedure
    .input(recordingId)
    .mutation(({ ctx, input }) => ({ stopped: manager(ctx).stop(input.recordingId) })),

  /** The recording / inspect session in progress, if any. */
  current: publicProcedure.query(({ ctx }) => ctx.recorder?.current() ?? null),

  /** Waits for the tester to click an element; null if cancelled [C-06]. */
  pick: publicProcedure
    .input(recordingId)
    .mutation(async ({ ctx, input }) => ({ locator: await manager(ctx).pick(input.recordingId) })),

  highlight: publicProcedure
    .input(recordingId.extend({ locator: LocatorSchema }))
    .mutation(({ ctx, input }) => manager(ctx).highlight(input.recordingId, input.locator)),

  /** Opens a product page to read its forms (no test needed) [R-02]. */
  startScan: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        productKey: z.string().min(1).optional(),
        environmentId: z.string().min(1).nullable().optional(),
        url: z.string().max(4000).optional(),
      }),
    )
    .mutation(({ ctx, input }) => manager(ctx).start({ ...input, mode: 'inspect' })),

  /** Forms of the page now open in the scan browser, as field specs to review [R-02]. */
  scanForms: publicProcedure.input(recordingId).mutation(async ({ ctx, input }) => {
    const scans = await manager(ctx).scanForms(input.recordingId);
    const stamp = Date.now().toString(36);
    return scans
      .filter((s) => s.controls.length > 0)
      .map((s, i) => inferForm(s, `form-${stamp}-${i + 1}`));
  }),

  /** Text description of the page now open, for the assistant; goes through the gateway before sending [AI-17]. */
  pageContext: publicProcedure.input(recordingId).query(async ({ ctx, input }) => {
    const c = await manager(ctx).pageContext(input.recordingId);
    return c ? pageContextText(c) : null;
  }),

  /** Interactive elements of the page now open, marked by whether any test of the project uses them [CV-03]. */
  scanElements: publicProcedure
    .input(recordingId.extend({ projectId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const scan = await manager(ctx).scanElements(input.recordingId);
      if (!scan) return null;
      const s = ctx.services;
      const used = s.testCases
        .list(input.projectId)
        .flatMap((t) => usedStrategies(s.testCases.get(t.id).content));
      const cov = elementCoverage(scan.elements, used);
      return {
        screenshot: scan.screenshot,
        width: scan.width,
        height: scan.height,
        coveredPercent: cov.coveredPercent,
        items: cov.items.map((i) => ({ ...i.element, covered: i.covered })),
      };
    }),

  /** ✓ / ✕ on a suggested check [M-01]. */
  suggestion: publicProcedure
    .input(recordingId.extend({ id: z.string().min(1), accept: z.boolean() }))
    .mutation(({ ctx, input }) => ({
      ok: manager(ctx).suggestion(input.recordingId, input.id, input.accept),
    })),

  events: publicProcedure.input(recordingId).subscription(async function* ({ ctx, input, signal }) {
    yield* manager(ctx).events(input.recordingId, signal);
  }),
});

/** Saved login sessions of a project (names + expiry only, never cookies) [F-02]. */
export const savedLoginsRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(({ ctx, input }) => ctx.services.savedLogins.list(input.projectId)),
  remove: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) => {
    ctx.services.savedLogins.remove(input.id);
    return { ok: true };
  }),
});

/** Field specs derived without a browser [R-02], tests generated from them [R-03]. */
export const formsRouter = router({
  /** Sample file for the field-specification import (.xlsx, base64) [R-14]. */
  specTemplate: publicProcedure.query(async () => ({
    data: Buffer.from(await writeExcel(FIELD_SPEC_TEMPLATE, 'Đặc tả')).toString('base64'),
  })),

  /** Field specification from an Excel file → a form to review [R-14]. */
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
      return formFromTable(table, name, `excel-${Date.now().toString(36)}`);
    }),

  /** A simple table → .xlsx (base64), e.g. the result matrix [R-09]. */
  tableToExcel: publicProcedure
    .input(
      z.object({
        columns: z.array(z.string()).min(1).max(100),
        rows: z.array(z.record(z.string(), z.string())).max(5000),
        sheetName: z.string().min(1).max(31).default('Ma trận'),
      }),
    )
    .mutation(async ({ input }) => ({
      data: Buffer.from(
        await writeExcel({ columns: input.columns, rows: input.rows }, input.sheetName),
      ).toString('base64'),
    })),

  /** Creates test cases for the ticked cases of a form's generated list. */
  generateTests: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        formId: z.string().min(1),
        caseIds: z.array(z.string().min(1)).min(1).max(500),
      }),
    )
    .mutation(({ ctx, input }) => generateFormTests(ctx.services, input)),

  /** JSON Schema / OpenAPI text → forms to review. */
  fromSchema: publicProcedure
    .input(z.object({ text: z.string().min(2).max(2_000_000) }))
    .mutation(({ input }) => {
      let json: unknown;
      try {
        json = JSON.parse(input.text);
      } catch {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not valid JSON' });
      }
      return formSpecsFromSchema(json, `schema-${Date.now().toString(36)}`);
    }),
});

import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { sleep } from '../assertions/actions';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { readPdfText } from '../files/read';
import { left, target } from './_common';

/**
 * Click "Print": the print dialog is swallowed and the page is saved as a PDF
 * file instead, then read like a download (`{{into.text}}`, `{{into.size}}`) so
 * the same checks as for any downloaded PDF apply [W-07, Q-04]. Needs a
 * headless browser (Chromium prints to PDF only without a window).
 */
export const printToFileAction = defineAction({
  type: 'printToFile',
  params: z.object({
    /** What to click to print (leave out to print the page as it is). */
    target: target.optional(),
    into: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    /** The printed text must contain this. */
    expectText: z.string().min(1).optional(),
    /** `A4` (default) or `Letter`. */
    format: z.enum(['A4', 'Letter']).default('A4'),
  }),
  ui: { label: 'actions.printToFile', icon: 'printer', group: 'data' },
  async execute(p, ctx) {
    const page = await ctx.page();
    if (p.target) {
      // Replace the dialog by a flag the step can wait for.
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__kiemiPrinted = false;
        window.print = () => {
          (window as unknown as Record<string, unknown>).__kiemiPrinted = true;
        };
      });
      const { locator } = await ctx.resolve(p.target);
      await locator.click({ timeout: left(ctx) });
      for (;;) {
        const done = await page.evaluate(
          () => (window as unknown as Record<string, unknown>).__kiemiPrinted === true,
        );
        if (done) break;
        if (ctx.remainingMs() < 300)
          throw new EngineError('ACTION_FAILED', 'The click did not ask to print the page', {});
        await sleep(100, ctx.signal);
      }
    }
    let bytes: Uint8Array;
    try {
      bytes = await page.pdf({ format: p.format, printBackground: true });
    } catch (err) {
      throw new EngineError(
        'ACTION_FAILED',
        'The page could not be saved as PDF (this needs a headless Chromium browser)',
        { reason: err instanceof Error ? err.message.split('\n')[0] : String(err) },
      );
    }
    const dir = await mkdtemp(join(tmpdir(), 'kiemi-print-'));
    const path = join(dir, 'page.pdf');
    await writeFile(path, bytes);
    const size = (await stat(path)).size;
    const text = await readPdfText(new Uint8Array(await readFile(path)));
    if (p.expectText !== undefined && !text.includes(p.expectText)) {
      throw new EngineError(
        'ASSERTION_FAILED',
        `Step ${ctx.stepNo}: the printed page does not contain "${p.expectText}"`,
        { check: 'print', op: 'contains', expected: p.expectText, actual: text.slice(0, 200) },
      );
    }
    ctx.vars.set(p.into, { name: 'page.pdf', ext: 'pdf', size, path, text });
    ctx.log(`${p.into} = page.pdf (${size} bytes)`);
  },
});

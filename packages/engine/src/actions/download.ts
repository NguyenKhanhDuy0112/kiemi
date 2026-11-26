import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { readCsvText, readPdfText, readXlsx } from '../files/read';
import { left, target } from './_common';

/**
 * Click something that downloads a file, check its name / type / size and read
 * it into a variable [Q-04]. The variable holds `name`, `ext`, `size`, `path`
 * and, by type: Excel → `sheets`, `sheet`, `rows` (list of objects by header),
 * optional `cell`; CSV → `rows`; PDF → `text`.
 */
export const downloadAction = defineAction({
  type: 'download',
  params: z.object({
    /** What to click to start the download. */
    target,
    into: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    /** The file name must contain this text. */
    expectName: z.string().min(1).optional(),
    /** File type without the dot: `xlsx`, `csv`, `pdf`… */
    expectType: z.string().min(1).optional(),
    minBytes: z.coerce.number().int().nonnegative().optional(),
    maxBytes: z.coerce.number().int().positive().optional(),
    /** Read the content into the variable (default yes, by file type). */
    read: z.boolean().default(true),
    /** Excel sheet (default: the first). */
    sheet: z.string().min(1).optional(),
    /** Excel region such as `A3:D10`; its first row is the header. */
    range: z.string().min(1).optional(),
    /** One Excel cell such as `B3` → `{{into.cell}}`. */
    cell: z.string().min(1).optional(),
  }),
  ui: { label: 'actions.download', icon: 'download', group: 'data' },
  async execute(p, ctx) {
    const page = await ctx.page();
    const { locator } = await ctx.resolve(p.target);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: left(ctx) }).catch(() => {
        throw new EngineError('ACTION_FAILED', 'No file was downloaded after the click', {});
      }),
      locator.click({ timeout: left(ctx) }),
    ]);
    const name = download.suggestedFilename();
    const dir = await mkdtemp(join(tmpdir(), 'kiemi-download-'));
    const path = join(dir, name);
    await download.saveAs(path);
    const size = (await stat(path)).size;
    const ext = extname(name).slice(1).toLowerCase();

    const fail = (message: string, details: Record<string, unknown>) =>
      new EngineError('ASSERTION_FAILED', message, { check: 'download', ...details });
    if (p.expectName !== undefined && !name.toLowerCase().includes(p.expectName.toLowerCase()))
      throw fail(`File name "${name}" does not contain "${p.expectName}"`, {
        expected: p.expectName,
        actual: name,
      });
    if (p.expectType !== undefined && ext !== p.expectType.replace(/^\./, '').toLowerCase())
      throw fail(`File type is ".${ext}", expected ".${p.expectType}"`, {
        expected: p.expectType,
        actual: ext,
      });
    if (p.minBytes !== undefined && size < p.minBytes)
      throw fail(`File is ${size} bytes, expected at least ${p.minBytes}`, {
        expected: p.minBytes,
        actual: size,
      });
    if (p.maxBytes !== undefined && size > p.maxBytes)
      throw fail(`File is ${size} bytes, expected at most ${p.maxBytes}`, {
        expected: p.maxBytes,
        actual: size,
      });

    const value: Record<string, unknown> = { name, ext, size, path };
    if (p.read) {
      const bytes = new Uint8Array(await readFile(path));
      if (ext === 'xlsx') {
        const x = await readXlsx(bytes, { sheet: p.sheet, range: p.range, cell: p.cell });
        Object.assign(value, { sheets: x.sheets, sheet: x.sheet, rows: x.table.rows });
        if (x.cell !== undefined) value.cell = x.cell;
      } else if (ext === 'csv' || ext === 'txt') {
        value.rows = readCsvText(new TextDecoder().decode(bytes)).rows;
      } else if (ext === 'pdf') {
        value.text = await readPdfText(bytes);
      }
    }
    ctx.vars.set(p.into, value);
    ctx.log(`${p.into} = ${name} (${size} bytes)`);
  },
});

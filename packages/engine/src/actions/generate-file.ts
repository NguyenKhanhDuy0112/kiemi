import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { type FileTable, readCsvText, readXlsx } from '../files/read';
import { writeCsvText, writeXlsx } from '../files/write';
import { stringify } from '../vars/evaluate';

const MAX_ROWS = 100_000;

/**
 * Build an Excel/CSV file to upload (import tests) [P-09]. Rows come from one of:
 * the test's data (`from: data`), a list variable (`list: {{children.SanPham}}`),
 * or are made up: `count` rows where each `columns` entry is a template written
 * per row, e.g. `{ "Mã": "SP{{loop.index}}", "Email": "{{fake.email}}" }`.
 * A sample `template` file (xlsx/csv) gives the column order and sample rows.
 * The variable `into` holds `{ name, ext, size, path, count, rows }`; upload it with `{{into.path}}`.
 */
export const generateFileAction = defineAction({
  type: 'generateFile',
  params: z
    .object({
      into: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      format: z.enum(['xlsx', 'csv']).default('xlsx'),
      /** File name without the extension. */
      fileName: z.string().min(1).default('du-lieu'),
      sheet: z.string().min(1).default('Dữ liệu'),
      from: z.enum(['columns', 'data', 'list', 'template']).default('columns'),
      /** Number of rows for `from: columns` (default: rows of the template, else 1). */
      count: z.coerce.number().int().positive().max(MAX_ROWS).optional(),
      /** Column → text template, evaluated for every row (`{{loop.index}}` counts from 1). */
      columns: z
        .record(z.string().min(1), z.union([z.string(), z.number()]).transform(String))
        .optional(),
      /** The rows when `from: list`. */
      list: z.unknown().optional(),
      /** Sample file whose header (and rows) are the starting point; relative to the files folder. */
      template: z.string().min(1).optional(),
    })
    .refine((p) => p.from !== 'columns' || p.columns !== undefined, 'columns is required')
    .refine((p) => p.from !== 'list' || p.list !== undefined, 'list is required')
    .refine((p) => p.from !== 'template' || p.template !== undefined, 'template is required'),
  ui: { label: 'actions.generateFile', icon: 'file-spreadsheet', group: 'data' },
  rawParams: ['columns'],
  async execute(p, ctx) {
    let table: FileTable = { columns: [], rows: [] };

    if (p.template) {
      const path =
        isAbsolute(p.template) || !ctx.run.filesDir
          ? p.template
          : resolve(ctx.run.filesDir, p.template);
      const bytes = new Uint8Array(
        await readFile(path).catch(() => {
          throw new EngineError('FILE_NOT_FOUND', `File not found: ${path}`, { file: path });
        }),
      );
      table = /\.xlsx$/i.test(path)
        ? (await readXlsx(bytes)).table
        : readCsvText(new TextDecoder().decode(bytes));
    }

    if (p.from === 'data') {
      const data = ctx.run.dataset;
      if (!data) throw new EngineError('INVALID_PARAMS', 'This test has no data to write', {});
      table = { columns: data.columns, rows: data.rows.map((r) => ({ ...r })) };
    } else if (p.from === 'list') {
      const list = p.list;
      if (!Array.isArray(list) || !list.every((x) => x !== null && typeof x === 'object'))
        throw new EngineError(
          'INVALID_PARAMS',
          'list must be a list of rows (e.g. {{children.SanPham}})',
          {},
        );
      const columns = [...new Set(list.flatMap((r) => Object.keys(r as object)))].filter(
        (c) => c !== 'text' && c !== 'cells',
      );
      table = {
        columns,
        rows: list.map((r) =>
          Object.fromEntries(columns.map((c) => [c, stringify((r as Record<string, unknown>)[c])])),
        ),
      };
    } else if (p.columns) {
      const columns = [...new Set([...table.columns, ...Object.keys(p.columns)])];
      const count = p.count ?? (table.rows.length || 1);
      const rows: Record<string, string>[] = [];
      for (let i = 0; i < count; i++) {
        const sample = table.rows[i % Math.max(1, table.rows.length)] ?? {};
        const row: Record<string, string> = { ...sample };
        // Fresh `{{random}}` etc. for every row.
        await ctx.vars.withFrame({ loop: { index: i + 1, count } }, async () => {
          for (const [col, tpl] of Object.entries(p.columns ?? {})) row[col] = ctx.vars.render(tpl);
        });
        rows.push(row);
      }
      table = { columns, rows };
    }
    if (table.columns.length === 0)
      throw new EngineError(
        'INVALID_PARAMS',
        'No columns to write: give columns or a template',
        {},
      );

    const dir = await mkdtemp(join(tmpdir(), 'kiemi-generated-'));
    const name = `${p.fileName.replace(/[\\/:*?"<>|]/g, '_')}.${p.format}`;
    const path = join(dir, name);
    if (p.format === 'xlsx') await writeFile(path, await writeXlsx(table, p.sheet));
    else await writeFile(path, writeCsvText(table));
    const size = (await stat(path)).size;
    ctx.vars.set(p.into, {
      name,
      ext: p.format,
      size,
      path,
      count: table.rows.length,
      rows: table.rows,
    });
    ctx.log(`${p.into} = ${name} (${table.rows.length} rows, ${size} bytes)`);
  },
});

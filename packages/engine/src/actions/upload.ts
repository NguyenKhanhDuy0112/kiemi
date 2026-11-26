import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, resolve } from 'node:path';
import type { Locator } from 'playwright-core';
import { z } from 'zod';
import { defineAction } from '../define-action';
import { EngineError } from '../errors';
import { left, target, text } from './_common';

const MIME: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.json': 'application/json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.zip': 'application/zip',
};

/** Drops the files on `zone` like a user dragging them in from the desktop [W-06]. */
async function dropFiles(zone: Locator, files: string[], timeout: number): Promise<void> {
  const payload = await Promise.all(
    files.map(async (f) => ({
      name: basename(f),
      type: MIME[extname(f).toLowerCase()] ?? 'application/octet-stream',
      data: (await readFile(f)).toString('base64'),
    })),
  );
  await zone.evaluate(
    (el, items) => {
      const dt = new DataTransfer();
      for (const it of items) {
        const bytes = Uint8Array.from(atob(it.data), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], it.name, { type: it.type }));
      }
      for (const type of ['dragenter', 'dragover', 'drop']) {
        el.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }),
        );
      }
    },
    payload,
    { timeout },
  );
}

/**
 * Upload files (fixed paths or from test data) [A-11]. Works with a visible or hidden
 * `<input type=file>`, a label/zone that wraps one, a button that opens the file
 * dialog, and a drag-and-drop zone [W-06].
 */
export const uploadAction = defineAction({
  type: 'upload',
  params: z.object({
    target,
    files: z.union([text, z.array(text).min(1)]),
    /** `auto` tries the input, then the file dialog, then a drop on the target. */
    via: z.enum(['auto', 'input', 'chooser', 'drop']).default('auto'),
  }),
  ui: { label: 'actions.upload', icon: 'upload', group: 'input' },
  async execute({ target: t, files, via }, ctx) {
    const list = (Array.isArray(files) ? files : [files]).map((f) =>
      isAbsolute(f) || !ctx.run.filesDir ? f : resolve(ctx.run.filesDir, f),
    );
    for (const f of list) {
      if (!existsSync(f))
        throw new EngineError('FILE_NOT_FOUND', `File not found: ${f}`, { file: f });
    }
    const { locator } = await ctx.resolve(t, { state: 'attached' });
    if (via === 'drop') return dropFiles(locator, list, left(ctx));

    if (via !== 'chooser') {
      // The input itself, or one hidden inside / behind the target (label, dropzone).
      const input = await locator.evaluateHandle((el) => {
        if (el instanceof HTMLInputElement && el.type === 'file') return el;
        if (el instanceof HTMLLabelElement && el.control instanceof HTMLInputElement) {
          if (el.control.type === 'file') return el.control;
        }
        return el.querySelector('input[type="file"]');
      });
      const found = input.asElement();
      if (found) {
        await found.setInputFiles(list, { timeout: left(ctx) });
        return;
      }
      if (via === 'input') {
        throw new EngineError('ELEMENT_NOT_FOUND', 'No file input in or behind the target', {
          via,
        });
      }
    }
    // A button that opens the file dialog.
    const page = await ctx.page();
    const wait =
      via === 'auto' ? Math.min(3000, Math.max(1, Math.floor(left(ctx) / 2))) : left(ctx);
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: wait }),
        locator.click({ timeout: left(ctx) }),
      ]);
      await chooser.setFiles(list);
    } catch (err) {
      // No file dialog opened: the target is probably a drop zone.
      if (via !== 'auto') throw err;
      await dropFiles(locator, list, left(ctx));
    }
  },
});

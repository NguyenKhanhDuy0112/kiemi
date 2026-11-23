import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { FileMap } from './files';
import { isManagedPath, META_DIR, normalizeText, PATHS, SKIP_DIRS, TESTS_DIR } from './format';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 20_000;
/** Suffix of half-written files (ignored by the scan and the watcher). */
export const TMP_SUFFIX = '.kiemi-tmp';

const abs = (root: string, rel: string) => join(root, ...rel.split('/'));

/** Reads every managed file of a project folder (normalized text). */
export function readProjectFiles(root: string): FileMap {
  const out: FileMap = new Map();
  let count = 0;
  const walk = (rel: string, depth: number) => {
    if (depth > 32 || count > MAX_FILES) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(rel ? abs(root, rel) : root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || path === PATHS.local) continue;
        if (!rel && e.name !== META_DIR && e.name !== TESTS_DIR) continue;
        walk(path, depth + 1);
      } else if (e.isFile() && isManagedPath(path)) {
        count++;
        try {
          if (statSync(abs(root, path)).size > MAX_FILE_BYTES) continue;
          out.set(path, normalizeText(readFileSync(abs(root, path), 'utf8')));
        } catch {
          // Deleted while scanning: treat as absent.
        }
      }
    }
  };
  walk('', 0);
  return out;
}

/** Writes via a temp file + rename, so readers never see half a file. */
export function writeProjectFile(root: string, rel: string, text: string): void {
  const file = abs(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}${TMP_SUFFIX}`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

export function deleteProjectFile(root: string, rel: string): void {
  try {
    unlinkSync(abs(root, rel));
  } catch {
    // Already gone.
  }
}

/** Creates the folder directories and removes empty ones that are no longer folders. */
export function syncTestDirs(root: string, dirs: Iterable<string>): void {
  const wanted = new Set<string>();
  for (const d of dirs) {
    mkdirSync(abs(root, `${TESTS_DIR}/${d}`), { recursive: true });
    const parts = d.split('/');
    for (let i = 1; i <= parts.length; i++) wanted.add(parts.slice(0, i).join('/').toLowerCase());
  }
  mkdirSync(abs(root, TESTS_DIR), { recursive: true });
  const prune = (rel: string): boolean => {
    const dir = abs(root, `${TESTS_DIR}${rel ? `/${rel}` : ''}`);
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    let empty = true;
    for (const e of entries) {
      if (e.isDirectory()) {
        const child = rel ? `${rel}/${e.name}` : e.name;
        if (!prune(child)) empty = false;
      } else empty = false;
    }
    if (rel && empty && !wanted.has(rel.toLowerCase())) {
      try {
        rmdirSync(dir);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };
  prune('');
}

/** `.kiemi/.gitignore` so machine-only files never reach Git. */
export function ensureGitignore(root: string): void {
  const file = abs(root, PATHS.gitignore);
  if (!existsSync(file)) writeProjectFile(root, PATHS.gitignore, 'local/\n');
}

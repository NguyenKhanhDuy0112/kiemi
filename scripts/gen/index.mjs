#!/usr/bin/env node
/**
 * Scaffold generator: `pnpm gen action|i18n|table|router <name>` (M9-07z).
 * Creates boilerplate and patches the registries. Never overwrites an existing file.
 * Run `pnpm lint:fix` afterwards if formatting differs.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const p = (...parts) => join(ROOT, ...parts);

const words = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
const kebab = (s) => words(s).join('-');
const camel = (s) =>
  words(s)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w))
    .join('');
const snake = (s) => words(s).join('_');

const fail = (msg) => {
  console.error(`gen: ${msg}`);
  process.exit(1);
};
const read = (f) => readFileSync(f, 'utf8');
const create = (file, content) => {
  if (existsSync(file)) fail(`${file} already exists`);
  writeFileSync(file, content);
  console.log(`created ${file.replace(`${ROOT}/`, '')}`);
};
const patch = (file, fn) => {
  const before = read(file);
  const after = fn(before);
  if (after === before) fail(`could not patch ${file}`);
  writeFileSync(file, after);
  console.log(`patched ${file.replace(`${ROOT}/`, '')}`);
};
const insertBefore = (src, marker, text) => {
  const i = src.lastIndexOf(marker);
  return i < 0 ? src : src.slice(0, i) + text + src.slice(i);
};

const UI = {
  vi: p('packages/shared/src/i18n/locales/vi-ui.ts'),
  en: p('packages/shared/src/i18n/locales/en-ui.ts'),
};

function genAction(name) {
  const file = kebab(name);
  const key = camel(name);
  const target = p('packages/engine/src/actions', `${file}.ts`);
  if (existsSync(target)) fail(`${target} already exists`);
  create(
    target,
    `import { z } from 'zod';
import { defineAction } from '../define-action';

/** TODO: describe the action [SPEC-ID]. */
export const ${key}Action = defineAction({
  type: '${key}',
  params: z.object({ value: z.string() }),
  ui: { label: 'actions.${key}', icon: 'circle', group: 'flow' },
  async execute(_params, _ctx) {
    // TODO: implement with Playwright (ctx.page ...).
  },
});
`,
  );
  patch(p('packages/engine/src/actions/index.ts'), (s) => {
    s = s.replace(
      /(import \{ waitUntilAction \} from '\.\/wait-until';\n)/,
      `$1import { ${key}Action } from './${file}';\n`,
    );
    return s.replace('  ...assertionActions,', `  ${key}Action,\n  ...assertionActions,`);
  });
  const entry = (label, sentence) =>
    `    ${key}: { label: '${label}', sentence: '${sentence}' },\n`;
  patch(UI.vi, (s) => s.replace(/^( {4}wait: \{)/m, `${entry('TODO nhãn', 'TODO câu mô tả')}$1`));
  patch(UI.en, (s) => s.replace(/^( {4}wait: \{)/m, `${entry('TODO label', 'TODO sentence')}$1`));
  console.log(
    `next: unit test + e2e on demo-site for "${key}"; sort import order with pnpm lint:fix`,
  );
}

function genI18n(name) {
  const key = camel(name);
  for (const [lang, file] of Object.entries(UI)) {
    patch(file, (s) =>
      insertBefore(s, '} as const', `  ${key}: {\n    title: 'TODO ${lang}',\n  },\n`),
    );
  }
}

function genTable(name) {
  const tbl = snake(name);
  const id = camel(name);
  const mig = p('packages/db/src/migrations.ts');
  const ids = [...read(mig).matchAll(/^\s{4}id: (\d+),/gm)].map((m) => Number(m[1]));
  const next = Math.max(...ids) + 1;
  patch(mig, (s) => {
    const i = s.lastIndexOf('];');
    return `${s.slice(0, i)}  {
    id: ${next},
    name: '${kebab(name)}',
    sql: \`CREATE TABLE "${tbl}" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL
);
CREATE INDEX "${tbl}_workspace_idx" ON "${tbl}" ("workspace_id");\`,
  },
${s.slice(i)}`;
  });
  patch(p('packages/db/src/tables.ts'), (s) => {
    const def = `/** TODO: describe (migration ${next}). */
export const ${id} = sqliteTable(
  '${tbl}',
  {
    ...base,
    name: text('name').notNull(),
  },
  (t) => [index('${tbl}_workspace_idx').on(t.workspaceId)],
);

`;
    s = insertBefore(s, 'export const ALL_TABLES', def);
    return s.replace('  savedLogins,\n} as const;', `  savedLogins,\n  ${id},\n} as const;`);
  });
  console.log(
    'next: add a service in packages/db/src/services/ and a test (migration test checks tables.ts matches the SQL)',
  );
}

function genRouter(name) {
  const file = kebab(name);
  const key = camel(name);
  create(
    p('apps/desktop/src/main/api/routers', `${file}.ts`),
    `import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

const id = z.string().min(1);

/** TODO: describe [SPEC-ID]. Input is always validated with Zod. */
export const ${key}Router = router({
  get: publicProcedure.input(z.object({ id })).query(({ input }) => {
    // TODO: call ctx.services.<service> (add ctx to the destructured args)
    return { id: input.id };
  }),
});
`,
  );
  patch(p('apps/desktop/src/main/api/root.ts'), (s) => {
    s = s.replace(
      "import { recorderRouter, savedLoginsRouter } from './routers/recorder';",
      `import { ${key}Router } from './routers/${file}';\nimport { recorderRouter, savedLoginsRouter } from './routers/recorder';`,
    );
    return s.replace(
      '  updates: updatesRouter,\n',
      `  updates: updatesRouter,\n  ${key}: ${key}Router,\n`,
    );
  });
}

const [kind, name] = process.argv.slice(2);
const kinds = { action: genAction, i18n: genI18n, table: genTable, router: genRouter };
if (!kinds[kind] || !name) fail('usage: pnpm gen action|i18n|table|router <name>');
kinds[kind](name);

export type SqlKind = 'read' | 'write' | 'empty';

export interface SqlCheck {
  kind: SqlKind;
  /** More than one statement (a `;` followed by more SQL). */
  multiple: boolean;
}

/** Skips a quoted run starting at `i` (a doubled quote inside is an escaped quote); returns its end. */
function endOfQuote(sql: string, i: number): number {
  const q = sql[i] as string;
  let j = i + 1;
  while (j < sql.length) {
    if (sql[j] === q) {
      if (sql[j + 1] === q) j += 2;
      else break;
    } else j++;
  }
  return j + 1;
}

/** Blank out comments and quoted text so keywords inside them are not mistaken for SQL. */
export function stripSql(sql: string): string {
  let out = '';
  for (let i = 0; i < sql.length; ) {
    const c = sql[i] as string;
    const n = sql[i + 1];
    if (c === '-' && n === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' ';
    } else if (c === '/' && n === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      out += ' ';
    } else if (c === "'" || c === '"' || c === '`') {
      i = endOfQuote(sql, i);
      out += c === "'" ? "''" : '""';
    } else if (c === '[') {
      const end = sql.indexOf(']', i + 1);
      i = end < 0 ? sql.length : end + 1;
      out += '""';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const READ_START = new Set([
  'select',
  'with',
  'show',
  'explain',
  'describe',
  'desc',
  'values',
  'table',
]);
/** Words that change data or schema anywhere in a statement (also inside a CTE). */
const WRITE_WORDS = new Set([
  'insert',
  'update',
  'delete',
  'merge',
  'replace',
  'upsert',
  'drop',
  'alter',
  'create',
  'truncate',
  'rename',
  'grant',
  'revoke',
  'exec',
  'execute',
  'call',
  'into',
  'copy',
  'vacuum',
  'attach',
  'detach',
  'pragma',
  'set',
  'lock',
  'load',
  'handler',
  'do',
]);

/**
 * Decides whether a statement only reads. Deliberately strict: anything it cannot prove
 * is a read counts as a write, and the tester has to say "write" on purpose [X-05].
 */
export function checkSql(sql: string): SqlCheck {
  const text = stripSql(sql).trim();
  if (text === '' || text === ';') return { kind: 'empty', multiple: false };
  const body = text.replace(/;\s*$/, '');
  const multiple = body.includes(';');
  const words = body.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [];
  const first = words[0] ?? '';
  const writes = words.some((w) => WRITE_WORDS.has(w));
  return { kind: READ_START.has(first) && !writes ? 'read' : 'write', multiple };
}

export type PlaceholderStyle = 'postgres' | 'mssql' | 'qmark';

/** `?` → `$1`/`@p1` (Postgres/SQL Server) outside quotes; MySQL and SQLite keep `?`. */
export function bindPlaceholders(
  sql: string,
  style: PlaceholderStyle,
): { sql: string; count: number } {
  let n = 0;
  let out = '';
  for (let i = 0; i < sql.length; ) {
    const c = sql[i] as string;
    if (c === "'" || c === '"' || c === '`') {
      const end = endOfQuote(sql, i);
      out += sql.slice(i, end);
      i = end;
    } else if (c === '?') {
      n++;
      out += style === 'postgres' ? `$${n}` : style === 'mssql' ? `@p${n}` : '?';
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return { sql: out, count: n };
}

import { describe, expect, it } from 'vitest';
import { bindPlaceholders, checkSql, stripSql } from './sql-safety';

describe('SQL safety [X-05]', () => {
  it.each([
    'SELECT * FROM don WHERE id = ?',
    '  select count(*) from don;',
    'WITH a AS (SELECT 1) SELECT * FROM a',
    'SHOW TABLES',
    "SELECT 'a quoted word: drop table x' AS t -- insert here",
    'SELECT /* update */ 1',
    'SELECT updated_at, "insert" FROM t',
    'SELECT [delete] FROM t',
    'EXPLAIN SELECT 1',
  ])('reads: %s', (sql) => {
    expect(checkSql(sql)).toEqual({ kind: 'read', multiple: false });
  });

  it.each([
    'DELETE FROM don',
    "UPDATE don SET status='x'",
    'INSERT INTO don VALUES (1)',
    'WITH d AS (DELETE FROM don RETURNING *) SELECT * FROM d',
    'SELECT * INTO copy FROM don',
    'SELECT * FROM don FOR UPDATE',
    'DROP TABLE don',
    'EXEC sp_who',
    'PRAGMA writable_schema = 1',
    'SET ROLE admin',
    'CALL proc()',
    'xyz',
  ])('writes (or unknown): %s', (sql) => {
    expect(checkSql(sql).kind).toBe('write');
  });

  it('sees a second statement behind a semicolon', () => {
    expect(checkSql('SELECT 1; DELETE FROM don')).toEqual({ kind: 'write', multiple: true });
    expect(checkSql('SELECT 1; SELECT 2').multiple).toBe(true);
    expect(checkSql('SELECT 1;').multiple).toBe(false);
  });

  it('knows an empty statement', () => {
    expect(checkSql(' -- nothing \n ')).toEqual({ kind: 'empty', multiple: false });
  });

  it('blanks comments and quoted text', () => {
    expect(stripSql("a 'x''y' b -- c\nd /* e */ f")).toBe("a '' b  \nd   f");
  });

  it('rewrites ? for each database, but not inside quotes', () => {
    const sql = "SELECT * FROM t WHERE a = ? AND b = '?' AND c = ?";
    expect(bindPlaceholders(sql, 'postgres')).toEqual({
      sql: "SELECT * FROM t WHERE a = $1 AND b = '?' AND c = $2",
      count: 2,
    });
    expect(bindPlaceholders(sql, 'mssql').sql).toContain('@p2');
    expect(bindPlaceholders(sql, 'qmark').sql).toBe(sql);
  });
});

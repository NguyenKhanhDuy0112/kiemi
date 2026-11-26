import type { DbConnection } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { connectionProblem, tidyConnection } from './db-connections-edit';

const pg: DbConnection = {
  name: 'qa',
  kind: 'postgres',
  host: 'db.local',
  port: 5432,
  database: 'don',
  username: ' tester ',
  passwordSecret: 'DB_PW',
  ssl: true,
};

describe('database connection form [X-05]', () => {
  it('asks for the missing piece of each kind', () => {
    expect(connectionProblem({ ...pg, name: '1x' }, [])).toBe('name');
    expect(connectionProblem(pg, ['qa'])).toBe('duplicate');
    expect(connectionProblem({ ...pg, host: '' }, [])).toBe('host');
    expect(connectionProblem({ ...pg, database: ' ' }, [])).toBe('database');
    expect(connectionProblem(pg, [])).toBeNull();
    expect(connectionProblem({ name: 'f', kind: 'sqlite', database: '', ssl: false }, [])).toBe(
      'file',
    );
    expect(
      connectionProblem({ name: 'f', kind: 'sqlite', database: '/x.db', ssl: false }, []),
    ).toBeNull();
  });
  it('drops host, user and password from a SQLite connection and trims text', () => {
    expect(tidyConnection({ ...pg, kind: 'sqlite', database: ' /x.db ' })).toEqual({
      name: 'qa',
      kind: 'sqlite',
      database: '/x.db',
      ssl: true,
    });
    expect(tidyConnection(pg)).toMatchObject({
      username: 'tester',
      passwordSecret: 'DB_PW',
      port: 5432,
    });
  });
});

import { bindPlaceholders, type DbQuery, type DbResult } from '@kiemi/engine';

/** SQL Server through `tedious`; values go as named parameters `@p1…`. */
export async function queryMssql(q: DbQuery): Promise<DbResult> {
  const { Connection, Request, TYPES } = await import('tedious');
  const { connection: c } = q;
  const { sql } = bindPlaceholders(q.sql, 'mssql');
  const conn = new Connection({
    server: c.host ?? 'localhost',
    authentication: {
      type: 'default',
      options: { userName: c.username ?? '', password: c.password ?? '' },
    },
    options: {
      port: c.port ?? 1433,
      database: c.database,
      encrypt: c.ssl,
      trustServerCertificate: true,
      connectTimeout: Math.max(1, q.timeoutMs),
      requestTimeout: Math.max(1, q.timeoutMs),
      rowCollectionOnRequestCompletion: true,
      useUTC: true,
    },
  });
  await new Promise<void>((resolve, reject) => {
    conn.on('connect', (err) => (err ? reject(err) : resolve()));
    conn.connect();
  });
  try {
    return await new Promise<DbResult>((resolve, reject) => {
      const req = new Request(sql, (err, rowCount, rows) => {
        if (err) return reject(err);
        const out = (rows as unknown as { metadata: { colName: string }; value: unknown }[][]).map(
          (cols) => Object.fromEntries(cols.map((col) => [col.metadata.colName, col.value])),
        );
        resolve({ rows: out, affected: rowCount });
      });
      q.args.forEach((v, i) => {
        const type =
          typeof v === 'number'
            ? Number.isInteger(v)
              ? TYPES.BigInt
              : TYPES.Float
            : typeof v === 'boolean'
              ? TYPES.Bit
              : TYPES.NVarChar;
        req.addParameter(`p${i + 1}`, type, v);
      });
      conn.execSql(req);
    });
  } finally {
    conn.close();
  }
}

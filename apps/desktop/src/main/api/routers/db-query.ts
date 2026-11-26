import { DbConnectionSchema } from '@kiemi/schema';
import { z } from 'zod';
import { createDbClient } from '../../db-query';
import { publicProcedure, router } from '../trpc';

/** Database connections of environments: "Test connection" [X-05]. */
export const dbQueryRouter = router({
  /**
   * Opens the connection (not yet saved) and asks `SELECT 1`; the password is read from the
   * environment's secret. Never throws: the answer says what went wrong in short words.
   */
  test: publicProcedure
    .input(z.object({ environmentId: z.string().min(1), connection: DbConnectionSchema }))
    .mutation(async ({ ctx, input }) => {
      const { secrets } = ctx.services.environments.forRun(input.environmentId);
      const secret = input.connection.passwordSecret;
      const password = secret ? secrets[secret] : undefined;
      if (secret && password === undefined)
        return { ok: false as const, message: `Chưa nhập giá trị cho bí mật “${secret}”` };
      try {
        await createDbClient().query({
          connection: { ...input.connection, password },
          sql: 'SELECT 1 AS ok',
          args: [],
          readOnly: true,
          maxRows: 1,
          timeoutMs: 8000,
        });
        return { ok: true as const, message: 'Kết nối được' };
      } catch (err) {
        let message = err instanceof Error ? err.message : String(err);
        for (const s of Object.values(secrets)) if (s) message = message.split(s).join('•••');
        return { ok: false as const, message: message.slice(0, 300) };
      }
    }),
});

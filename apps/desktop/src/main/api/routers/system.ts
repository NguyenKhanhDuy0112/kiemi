import { AppSettingsPatchSchema } from '@kiemi/db';
import { builtinActions, detectInstalledBrowsers } from '@kiemi/engine';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { testSshConnection } from '../../tunnel/ssh-tunnel';
import { publicProcedure, router } from '../trpc';

/** JSON Schema of an action's params as the user writes them (input side). */
function paramsSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
  } catch {
    return { type: 'object' };
  }
}

export interface ActionInfo {
  type: string;
  group: string;
  icon: string;
  /** Param keys holding nested steps / conditions. */
  rawParams: string[];
  container: boolean;
  /** JSON Schema used by the renderer to generate the step form (M3-03). */
  schema: Record<string, unknown>;
}

/** Computed once: actions do not change while the app runs. */
let catalog: ActionInfo[] | undefined;
export function actionCatalog(): ActionInfo[] {
  catalog ??= builtinActions.map((a) => ({
    type: a.type,
    group: a.ui.group,
    icon: a.ui.icon,
    rawParams: [...(a.rawParams ?? [])],
    container: a.container === true,
    schema: paramsSchema(a.params),
  }));
  return catalog;
}

export const systemRouter = router({
  /** Every built-in action with its form schema [M3-02, M3-03]. */
  actions: publicProcedure.query(() => actionCatalog()),

  /** Edge/Chrome installed on this computer [G-01]. */
  browsers: publicProcedure.query(() => detectInstalledBrowsers().map((b) => b.kind)),

  /** App settings [S-07]. */
  settings: publicProcedure.query(({ ctx }) => ctx.services.settings.getAll()),
  updateSettings: publicProcedure.input(AppSettingsPatchSchema).mutation(({ ctx, input }) => {
    const next = ctx.services.settings.update(input);
    if (input.crashReports !== undefined) ctx.crashReports?.setEnabled(input.crashReports);
    return next;
  }),

  /** "Kiểm tra kết nối" for the SSH tunnel of one cell (environment, product) [G-07, O-02]. */
  testSsh: publicProcedure
    .input(z.object({ environmentId: z.string().min(1), productId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { secrets } = ctx.services.environments.forRun(input.environmentId);
      const ssh = ctx.services.environments.cell(input.environmentId, input.productId)?.ssh;
      if (!ssh)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This environment has no SSH settings',
        });
      return testSshConnection(ssh, secrets);
    }),
});

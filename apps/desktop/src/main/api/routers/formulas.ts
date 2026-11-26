import { VariableStore } from '@kiemi/engine';
import { FormulasSchema } from '@kiemi/schema';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/** Values typed in the test box: JSON for lists/objects/numbers, else plain text. */
function parseValue(text: string): unknown {
  const t = text.trim();
  if (t === '') return '';
  try {
    return JSON.parse(t);
  } catch {
    return text;
  }
}

/** Tries a formula or expression with sample values and shows every step [P-03]. */
export const formulasRouter = router({
  explain: publicProcedure
    .input(
      z.object({
        expression: z.string().min(1),
        formulas: FormulasSchema,
        values: z.record(z.string(), z.string()).default({}),
      }),
    )
    .mutation(({ input }) => {
      try {
        const store = new VariableStore({
          formulas: Object.fromEntries(
            Object.entries(input.formulas).map(([k, f]) => [
              k,
              { params: f.params, expression: f.expression },
            ]),
          ),
        });
        for (const [name, text] of Object.entries(input.values)) store.set(name, parseValue(text));
        const { value, steps } = store.explain(input.expression);
        return {
          ok: true as const,
          value: typeof value === 'string' ? value : JSON.stringify(value),
          steps: steps.map((s) => ({
            text: s.text,
            depth: s.depth,
            value: typeof s.value === 'string' ? s.value : JSON.stringify(s.value),
          })),
        };
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    }),
});

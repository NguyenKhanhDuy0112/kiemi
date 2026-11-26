import { z } from 'zod';

/** Name of a formula or of one of its inputs: letters (Vietnamese too), digits, `_`. */
export const FormulaNameSchema = z
  .string()
  .regex(/^[\p{L}_][\p{L}\p{N}_]*$/u, 'Use letters, digits and _ (not starting with a digit)');

/** A named formula with inputs, defined once per project [P-03]. */
export const FormulaSchema = z
  .object({
    params: z.array(FormulaNameSchema).default([]),
    expression: z.string().trim().min(1),
    description: z.string().optional(),
  })
  .superRefine((f, ctx) => {
    if (new Set(f.params).size !== f.params.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate input name', path: ['params'] });
  });
export type Formula = z.infer<typeof FormulaSchema>;

/** Formulas of a project by name (names are unique ignoring case). */
export const FormulasSchema = z.record(FormulaNameSchema, FormulaSchema).superRefine((all, ctx) => {
  const seen = new Set<string>();
  for (const name of Object.keys(all)) {
    const k = name.toLowerCase();
    if (seen.has(k))
      ctx.addIssue({ code: 'custom', message: `Duplicate formula "${name}"`, path: [name] });
    seen.add(k);
  }
});
export type Formulas = z.infer<typeof FormulasSchema>;

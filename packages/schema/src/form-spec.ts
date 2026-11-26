import { z } from 'zod';
import { LocatorSchema } from './locator';

/**
 * Field specification of a form: what each input accepts, so tests can be
 * derived by standard techniques instead of typed by hand [R-01].
 */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'money',
  'email',
  'phone',
  'password',
  'date',
  'dropdown',
  'checkbox',
  'file',
] as const;
export const FieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof FieldTypeSchema>;

/** Characters a text field accepts; `any` = no restriction. */
export const ALLOWED_CHARS = ['any', 'digits', 'letters', 'alnum', 'no-special'] as const;
export const AllowedCharsSchema = z.enum(ALLOWED_CHARS);
export type AllowedChars = z.infer<typeof AllowedCharsSchema>;

export const FIELD_CONDITION_OPS = ['equals', 'notEquals', 'filled', 'empty'] as const;
/** "Field `field` is …": used by `visibleWhen` and `requiredWhen`. */
export const FieldConditionSchema = z.object({
  /** Key of another field of the same form. */
  field: z.string().min(1),
  op: z.enum(FIELD_CONDITION_OPS).default('filled'),
  value: z.string().optional(),
});
export type FieldCondition = z.infer<typeof FieldConditionSchema>;

export const COMPARE_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;
/** "This field must be ≥ / = … another field" (end date ≥ start date, confirm password = password). */
export const FieldCompareSchema = z.object({
  field: z.string().min(1),
  op: z.enum(COMPARE_OPS),
});
export type FieldCompare = z.infer<typeof FieldCompareSchema>;

export const FieldFileSchema = z.object({
  /** Extensions without the dot, e.g. `["pdf","png"]`; empty = any. */
  extensions: z.array(z.string().trim().min(1)).max(30).default([]),
  maxSizeKb: z.number().int().positive().optional(),
});

/** Key of a field inside its form: used by conditions and comparisons. */
export const FieldKeySchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]{0,39}$/, 'Field key must be letters, digits or `_`');

export const FieldSpecSchema = z
  .object({
    key: FieldKeySchema,
    /** Label testers see, e.g. "Số điện thoại". */
    label: z.string().trim().min(1).max(100),
    type: FieldTypeSchema.default('text'),
    /** Where the input is on the page (picked or inferred [R-02]). */
    locator: LocatorSchema.optional(),
    required: z.boolean().default(false),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(0).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    /** Regular expression the whole value must match. */
    pattern: z.string().optional(),
    allowedChars: AllowedCharsSchema.default('any'),
    /** The value must not already exist (e.g. username, email). */
    unique: z.boolean().default(false),
    defaultValue: z.string().optional(),
    /** A value the field accepts, used when generating tests (needed for hand-written patterns). */
    example: z.string().optional(),
    readOnly: z.boolean().default(false),
    /** Dropdown choices. */
    options: z.array(z.string()).max(200).default([]),
    visibleWhen: FieldConditionSchema.optional(),
    requiredWhen: FieldConditionSchema.optional(),
    compare: FieldCompareSchema.optional(),
    file: FieldFileSchema.optional(),
    /** Shared rules attached by name, e.g. `vn-phone` [R-10]. */
    ruleRefs: z.array(z.string().min(1)).max(20).default([]),
  })
  .superRefine((f, ctx) => {
    if (f.minLength !== undefined && f.maxLength !== undefined && f.minLength > f.maxLength)
      ctx.addIssue({ code: 'custom', path: ['minLength'], message: 'minLength > maxLength' });
    if (f.min !== undefined && f.max !== undefined && f.min > f.max)
      ctx.addIssue({ code: 'custom', path: ['min'], message: 'min > max' });
    if (f.pattern !== undefined) {
      try {
        new RegExp(f.pattern);
      } catch {
        ctx.addIssue({ code: 'custom', path: ['pattern'], message: 'Invalid regular expression' });
      }
    }
    if (f.type === 'dropdown' && f.options.length === 0 && !f.readOnly)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Dropdown needs options' });
  });
export type FieldSpec = z.infer<typeof FieldSpecSchema>;
export type FieldSpecInput = z.input<typeof FieldSpecSchema>;

export const FormSpecSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(100),
    /** Product the form belongs to (null = whole project). */
    productId: z.string().min(1).nullish(),
    /** Page of the form, relative to `{{app}}`. */
    path: z.string().optional(),
    /** The button that sends the form. */
    submit: LocatorSchema.optional(),
    fields: z.array(FieldSpecSchema).max(200).default([]),
  })
  .superRefine((form, ctx) => {
    const keys = new Set<string>();
    form.fields.forEach((f, i) => {
      if (keys.has(f.key))
        ctx.addIssue({
          code: 'custom',
          path: ['fields', i, 'key'],
          message: 'Duplicate field key',
        });
      keys.add(f.key);
    });
    form.fields.forEach((f, i) => {
      for (const [name, ref] of [
        ['visibleWhen', f.visibleWhen?.field],
        ['requiredWhen', f.requiredWhen?.field],
        ['compare', f.compare?.field],
      ] as const) {
        if (ref === undefined) continue;
        if (ref === f.key || !keys.has(ref))
          ctx.addIssue({
            code: 'custom',
            path: ['fields', i, name, 'field'],
            message: 'Refers to an unknown field',
          });
      }
    });
  });
export type FormSpec = z.infer<typeof FormSpecSchema>;
export type FormSpecInput = z.input<typeof FormSpecSchema>;

export const FormSpecsSchema = z.array(FormSpecSchema).max(200);

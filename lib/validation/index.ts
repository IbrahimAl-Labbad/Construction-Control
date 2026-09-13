/**
 * lib/validation/index.ts
 *
 * Reusable Zod validation patterns and common schemas.
 *
 * See AGENTS.md §12 for validation rules.
 *
 * CONVENTION:
 * - Domain-specific schemas live in lib/validation/schemas/<domain>.ts
 * - Common/shared schemas are in this file
 * - Always use schema.safeParse(input) in API routes and server actions
 * - Use z.infer<typeof schema> to derive TypeScript types — never duplicate types
 *
 * Usage:
 *   import { moneySchema, paginationSchema } from '@/lib/validation';
 *   import type { PaginationInput } from '@/lib/validation';
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Money schema
// ---------------------------------------------------------------------------

/**
 * Validates a monetary value as a string representing a non-negative decimal
 * with at most 2 decimal places.
 *
 * Money is received as a string to avoid floating-point precision issues.
 * Before storing in the database, convert to Prisma Decimal.
 *
 * See AGENTS.md §7 and §10 for money rules.
 *
 * @example
 * moneySchema.parse('100.00')  // ✅
 * moneySchema.parse('99')      // ✅
 * moneySchema.parse('-1.00')   // ❌
 * moneySchema.parse('1.234')   // ❌
 * moneySchema.parse(100)       // ❌ (must be string)
 */
export const moneySchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'يجب أن يكون المبلغ رقمًا صحيحًا أو عشريًا بمنزلتين')
  .refine((val) => parseFloat(val) >= 0, {
    message: 'يجب أن يكون المبلغ صفرًا أو أكبر',
  });

export type MoneyInput = z.infer<typeof moneySchema>;

// ---------------------------------------------------------------------------
// ID schema
// ---------------------------------------------------------------------------

/**
 * Validates a cuid2 or cuid string ID.
 */
export const idSchema = z.string().min(1, 'المعرف مطلوب');

export type IdInput = z.infer<typeof idSchema>;

// ---------------------------------------------------------------------------
// Pagination schema
// ---------------------------------------------------------------------------

/**
 * Standard pagination parameters for list endpoints.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ---------------------------------------------------------------------------
// Date range schema
// ---------------------------------------------------------------------------

/**
 * Date range for filtering queries.
 * Both dates are optional — callers may filter by start, end, or both.
 */
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  {
    message: 'يجب أن يكون تاريخ البداية قبل تاريخ النهاية',
    path: ['endDate'],
  },
);

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/**
 * Validates input against a schema and returns a structured result.
 *
 * Use this in Server Actions and API routes to get consistent error shapes.
 *
 * @example
 * const result = validate(mySchema, requestBody);
 * if (!result.success) {
 *   return { error: 'VALIDATION_ERROR', details: result.errors };
 * }
 * // result.data is typed correctly
 */
export function validate<T>(
  schema: z.ZodType<T>,
  input: unknown,
):
  | { success: true; data: T }
  | { success: false; errors: Array<{ path: string; message: string }> } {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  };
}

// ---------------------------------------------------------------------------
// Re-export zod for convenience
// ---------------------------------------------------------------------------

export { z };

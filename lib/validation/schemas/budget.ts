/**
 * lib/validation/schemas/budget.ts
 *
 * Zod validation schemas for Project Budget operations.
 *
 * Single source of validation truth for the Budget module.
 * Follows AGENTS.md §13 (financial validation) and §16 (Zod validation rules).
 */

import { z } from 'zod';
import { BudgetCategory } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyToNull(v: unknown): unknown {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Monetary amount schema
// ---------------------------------------------------------------------------

/**
 * Monetary amount input string schema.
 * Must be a positive decimal string with up to 2 decimal places.
 * Rejects negatives, zero, and malformed numeric strings.
 */
export const moneyAmountSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : v),
  z
    .string()
    .min(1, 'المبلغ مطلوب')
    .regex(
      /^\d+(\.\d{1,2})?$/,
      'المبلغ يجب أن يكون رقماً موجباً بدقة لا تتجاوز خانتين عشريتين (مثال: 1500 أو 1500.50)',
    )
    .refine((val) => {
      // Must be strictly greater than zero (not "0", "0.0", "0.00")
      return !/^0+(\.0+)?$/.test(val);
    }, 'المبلغ يجب أن يكون أكبر من صفر'),
);

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const budgetIdSchema = z
  .string()
  .min(1, 'معرّف الموازنة مطلوب')
  .cuid('معرّف الموازنة غير صالح');

export const budgetLineIdSchema = z
  .string()
  .min(1, 'معرّف بند الموازنة مطلوب')
  .cuid('معرّف بند الموازنة غير صالح');

// ---------------------------------------------------------------------------
// BudgetLine schema
// ---------------------------------------------------------------------------

export const budgetLineInputSchema = z.object({
  category: z.nativeEnum(BudgetCategory),
  description: z
    .string()
    .trim()
    .min(3, 'وصف البند يجب أن يتكون من 3 أحرف على الأقل')
    .max(500, 'وصف البند لا يمكن أن يتجاوز 500 حرف'),
  amount: moneyAmountSchema,
});

// ---------------------------------------------------------------------------
// Create budget draft schema
// ---------------------------------------------------------------------------

export const createBudgetDraftSchema = z.object({
  projectId: z
    .string()
    .min(1, 'معرّف المشروع مطلوب')
    .cuid('معرّف المشروع غير صالح'),
  notes: z.preprocess(
    emptyToNull,
    z.string().max(2000, 'الملاحظات لا يمكن أن تتجاوز 2000 حرف').nullable().optional(),
  ),
  lines: z
    .array(budgetLineInputSchema)
    .min(1, 'يجب إضافة بند واحد على الأقل للموازنة'),
});

// ---------------------------------------------------------------------------
// Update budget draft schema
// ---------------------------------------------------------------------------

export const updateBudgetDraftSchema = z.object({
  notes: z.preprocess(
    emptyToNull,
    z.string().max(2000, 'الملاحظات لا يمكن أن تتجاوز 2000 حرف').nullable().optional(),
  ),
  lines: z
    .array(budgetLineInputSchema)
    .min(1, 'يجب إضافة بند واحد على الأقل للموازنة'),
});

// ---------------------------------------------------------------------------
// Reject budget schema
// ---------------------------------------------------------------------------

export const rejectBudgetSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(3, 'سبب الرفض يجب أن يتكون من 3 أحرف على الأقل')
    .max(500, 'سبب الرفض لا يمكن أن يتجاوز 500 حرف'),
});

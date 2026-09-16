/**
 * lib/validation/schemas/expense.ts
 *
 * Zod validation schemas for Project Expense operations.
 *
 * Single source of validation truth for the Expense module.
 * Follows AGENTS.md §13 (financial validation) and §16 (Zod validation rules).
 */

import { z } from 'zod';
import { moneyAmountSchema } from './budget';

export { moneyAmountSchema };

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const expenseIdSchema = z
  .string()
  .min(1, 'معرّف المصروف مطلوب')
  .cuid('معرّف المصروف غير صالح');

// ---------------------------------------------------------------------------
// Expense Date Schema
// ---------------------------------------------------------------------------

function parseExpenseDate(v: unknown): unknown {
  if (v instanceof Date) return isNaN(v.getTime()) ? v : v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return v;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? v : d;
  }
  return v;
}

/**
 * Validates expense date. Must be a valid date and cannot be in the future.
 */
export const expenseDateSchema = z.preprocess(
  parseExpenseDate,
  z
    .date({
      message: 'تاريخ المصروف غير صالح',
    })
    .refine((date) => {
      // Cannot be more than 1 day in the future (accounting for timezone differences)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return date <= tomorrow;
    }, 'تاريخ المصروف لا يمكن أن يكون في المستقبل'),
);

// ---------------------------------------------------------------------------
// Create Expense Draft Schema
// ---------------------------------------------------------------------------

export const createExpenseDraftSchema = z.object({
  projectId: z
    .string()
    .min(1, 'معرّف المشروع مطلوب')
    .cuid('معرّف المشروع غير صالح'),
  budgetLineId: z
    .string()
    .min(1, 'معرّف بند الموازنة مطلوب')
    .cuid('معرّف بند الموازنة غير صالح'),
  amount: moneyAmountSchema,
  expenseDate: expenseDateSchema,
  description: z
    .string()
    .trim()
    .min(3, 'وصف المصروف يجب أن يتكون من 3 أحرف على الأقل')
    .max(1000, 'وصف المصروف لا يمكن أن يتجاوز 1000 حرف'),
});

export type CreateExpenseDraftInput = z.infer<typeof createExpenseDraftSchema>;

// ---------------------------------------------------------------------------
// Update Expense Draft Schema
// ---------------------------------------------------------------------------

export const updateExpenseDraftSchema = z.object({
  budgetLineId: z
    .string()
    .min(1, 'معرّف بند الموازنة مطلوب')
    .cuid('معرّف بند الموازنة غير صالح'),
  amount: moneyAmountSchema,
  expenseDate: expenseDateSchema,
  description: z
    .string()
    .trim()
    .min(3, 'وصف المصروف يجب أن يتكون من 3 أحرف على الأقل')
    .max(1000, 'وصف المصروف لا يمكن أن يتجاوز 1000 حرف'),
});

export type UpdateExpenseDraftInput = z.infer<typeof updateExpenseDraftSchema>;

// ---------------------------------------------------------------------------
// Reject Expense Schema
// ---------------------------------------------------------------------------

export const rejectExpenseSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(3, 'سبب الرفض يجب أن يتكون من 3 أحرف على الأقل')
    .max(500, 'سبب الرفض لا يمكن أن يتجاوز 500 حرف'),
});

export type RejectExpenseInput = z.infer<typeof rejectExpenseSchema>;

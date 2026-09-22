/**
 * lib/validation/schemas/payroll.ts
 *
 * Zod validation schemas for Payroll Data Entry / Project Labor Cost Control.
 * Single source of validation truth for the Payroll module.
 *
 * Follows AGENTS.md §13 (financial validation) and §16 (Zod validation rules).
 * All inputs are validated server-side before database access.
 *
 * Scope boundary (AGENTS.md §3, §4):
 *   Project labor cost capture only.
 *   HR employee contracts, payroll processing, salary payment,
 *   attendance, and bank transfers are strictly OUT OF SCOPE.
 */

import { z } from 'zod';
import { moneyAmountSchema } from './budget';

export { moneyAmountSchema };
export const payrollAmountSchema = moneyAmountSchema;

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const payrollIdSchema = z
  .string()
  .min(1, 'معرّف قيد الراتب مطلوب')
  .cuid('معرّف قيد الراتب غير صالح');

// ---------------------------------------------------------------------------
// Worker Name Schema
// Normalization is consistent with normalizePayrollWorkerName in domain layer.
// ---------------------------------------------------------------------------

function normalizeWorkerName(v: unknown): unknown {
  if (typeof v === 'string') {
    return v.trim().replace(/\s+/g, ' ');
  }
  return v;
}

export const workerNameSchema = z.preprocess(
  normalizeWorkerName,
  z
    .string()
    .min(3, 'اسم العامل يجب أن يتكون من 3 أحرف على الأقل')
    .max(100, 'اسم العامل لا يمكن أن يتجاوز 100 حرف'),
);

// ---------------------------------------------------------------------------
// Worker Reference Schema (Optional site badge / identifier snapshot)
// ---------------------------------------------------------------------------

function normalizeWorkerReference(v: unknown): unknown {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  }
  return v;
}

export const workerReferenceSchema = z.preprocess(
  normalizeWorkerReference,
  z
    .string()
    .min(3, 'الرقم المرجعي للعامل يجب أن يتكون من 3 أحرف على الأقل')
    .max(50, 'الرقم المرجعي للعامل لا يمكن أن يتجاوز 50 حرفاً')
    .regex(
      /^[a-zA-Z0-9\-_]+$/,
      'الرقم المرجعي للعامل يجب أن يحتوي فقط على أحرف وأرقام وشرطات',
    )
    .nullable()
    .optional(),
);

// ---------------------------------------------------------------------------
// Trade / Title Schema (Optional plain text snapshot)
// ---------------------------------------------------------------------------

function normalizeTradeOrTitle(v: unknown): unknown {
  if (typeof v === 'string') {
    const trimmed = v.trim().replace(/\s+/g, ' ');
    return trimmed === '' ? null : trimmed;
  }
  return v;
}

export const tradeOrTitleSchema = z.preprocess(
  normalizeTradeOrTitle,
  z
    .string()
    .max(50, 'المهنة أو المسمى الوظيفي لا يمكن أن يتجاوز 50 حرفاً')
    .nullable()
    .optional(),
);

// ---------------------------------------------------------------------------
// Period Schemas (Year: 2020..2050, Month: 1..12)
// Uses z.coerce.number() to support string inputs from forms / Server Actions.
// ---------------------------------------------------------------------------

export const periodYearSchema = z.coerce
  .number()
  .int('سنة الفترة يجب أن تكون رقماً صحيحاً')
  .min(2020, 'سنة الفترة يجب أن تكون بين 2020 و 2050')
  .max(2050, 'سنة الفترة يجب أن تكون بين 2020 و 2050');

export const periodMonthSchema = z.coerce
  .number()
  .int('شهر الفترة يجب أن يكون رقماً صحيحاً')
  .min(1, 'شهر الفترة يجب أن يكون بين 1 و 12')
  .max(12, 'شهر الفترة يجب أن يكون بين 1 و 12');

// ---------------------------------------------------------------------------
// Description Schema
// ---------------------------------------------------------------------------

export const payrollDescriptionSchema = z
  .string()
  .trim()
  .min(3, 'وصف قيد الراتب يجب أن يتكون من 3 أحرف على الأقل')
  .max(2000, 'وصف قيد الراتب لا يمكن أن يتجاوز 2000 حرف');

// ---------------------------------------------------------------------------
// Currency Schema (SAR only in v1)
// ---------------------------------------------------------------------------

export const payrollCurrencySchema = z
  .string()
  .trim()
  .default('SAR')
  .refine((val) => val === 'SAR', {
    message: 'العملة المدعومة هي الريال السعودي (SAR) فقط',
  });

// ---------------------------------------------------------------------------
// Create Payroll Draft Schema
// Excludes server-owned lifecycle tracking fields.
// ---------------------------------------------------------------------------

export const createPayrollDraftSchema = z.object({
  projectId: z
    .string()
    .min(1, 'معرّف المشروع مطلوب')
    .cuid('معرّف المشروع غير صالح'),
  budgetLineId: z
    .string()
    .min(1, 'معرّف بند الموازنة مطلوب')
    .cuid('معرّف بند الموازنة غير صالح'),
  workerName: workerNameSchema,
  workerReference: workerReferenceSchema,
  tradeOrTitle: tradeOrTitleSchema,
  periodYear: periodYearSchema,
  periodMonth: periodMonthSchema,
  amount: moneyAmountSchema,
  currency: payrollCurrencySchema,
  description: payrollDescriptionSchema,
});

export type CreatePayrollDraftInput = z.infer<typeof createPayrollDraftSchema>;

// ---------------------------------------------------------------------------
// Update Payroll Draft Schema
// Only mutable fields while in DRAFT status. Excludes server-owned fields.
// ---------------------------------------------------------------------------

export const updatePayrollDraftSchema = z.object({
  projectId: z
    .string()
    .min(1, 'معرّف المشروع مطلوب')
    .cuid('معرّف المشروع غير صالح')
    .optional(),
  budgetLineId: z
    .string()
    .min(1, 'معرّف بند الموازنة مطلوب')
    .cuid('معرّف بند الموازنة غير صالح')
    .optional(),
  workerName: workerNameSchema.optional(),
  workerReference: workerReferenceSchema,
  tradeOrTitle: tradeOrTitleSchema,
  periodYear: periodYearSchema.optional(),
  periodMonth: periodMonthSchema.optional(),
  amount: moneyAmountSchema.optional(),
  description: payrollDescriptionSchema.optional(),
});

export type UpdatePayrollDraftInput = z.infer<typeof updatePayrollDraftSchema>;

// ---------------------------------------------------------------------------
// Reject Payroll Schema
// rejectionReason is mandatory (SUBMITTED -> REJECTED).
// ---------------------------------------------------------------------------

export const rejectPayrollSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(5, 'سبب الرفض يجب أن يتكون من 5 أحرف على الأقل')
    .max(1000, 'سبب الرفض لا يمكن أن يتجاوز 1000 حرف'),
});

export type RejectPayrollInput = z.infer<typeof rejectPayrollSchema>;

// ---------------------------------------------------------------------------
// Cancel Payroll Schema
// cancellationReason is mandatory.
// ---------------------------------------------------------------------------

export const cancelPayrollSchema = z.object({
  cancellationReason: z
    .string()
    .trim()
    .min(5, 'سبب الإلغاء يجب أن يتكون من 5 أحرف على الأقل')
    .max(1000, 'سبب الإلغاء لا يمكن أن يتجاوز 1000 حرف'),
});

export type CancelPayrollInput = z.infer<typeof cancelPayrollSchema>;

// ---------------------------------------------------------------------------
// Identifier input type
// ---------------------------------------------------------------------------

export type PayrollIdInput = z.infer<typeof payrollIdSchema>;

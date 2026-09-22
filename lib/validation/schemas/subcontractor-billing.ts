/**
 * lib/validation/schemas/subcontractor-billing.ts
 *
 * Zod validation schemas for Subcontractor Billing operations.
 * Single source of validation truth for the SubcontractorBilling module.
 *
 * Follows AGENTS.md §13 (financial validation) and §16 (Zod validation rules).
 * All inputs are validated server-side before any database access.
 */

import { z } from 'zod';
import { moneyAmountSchema } from './budget';

export { moneyAmountSchema };

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const billingIdSchema = z
  .string()
  .min(1, 'معرّف المستخلص مطلوب')
  .cuid('معرّف المستخلص غير صالح');

// ---------------------------------------------------------------------------
// Reference Number Normalization
// Reuses exact pattern from commitment.ts (Mandatory Correction 2)
// ---------------------------------------------------------------------------

/**
 * Normalizes billing reference number:
 *   - Empty string or whitespace-only → null
 *   - Otherwise trim and validate length ≤ 100
 * When not null, must be unique per project (enforced by partial DB index).
 */
function normalizeBillingReferenceNumber(v: unknown): unknown {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  }
  return v;
}

export const billingReferenceNumberSchema = z.preprocess(
  normalizeBillingReferenceNumber,
  z
    .string()
    .max(100, 'رقم مرجع المستخلص لا يمكن أن يتجاوز 100 حرف')
    .nullable()
    .optional(),
);

export const referenceNumberSchema = billingReferenceNumberSchema;

// ---------------------------------------------------------------------------
// Subcontractor Name Schema
// ---------------------------------------------------------------------------

/**
 * Subcontractor name in plain text (no Vendor master entity in v1).
 * Must match commitment.vendorName — enforced at application layer.
 * Decision #24: SUBCONTRACTOR_NAME_MISMATCH thrown if they differ.
 */
export const subcontractorNameSchema = z
  .string()
  .trim()
  .min(2, 'اسم مقاول الباطن يجب أن يتكون من حرفين على الأقل')
  .max(150, 'اسم مقاول الباطن لا يمكن أن يتجاوز 150 حرفاً');

// ---------------------------------------------------------------------------
// Billing Period Schema
// Decision #23: billingPeriod is descriptive free text. No uniqueness constraint.
// ---------------------------------------------------------------------------

/**
 * Descriptive billing period text (e.g. "سبتمبر 2026", "الشهر الأول").
 * No database uniqueness constraint — confirmed by design gate decision #23.
 */
export const billingPeriodSchema = z
  .string()
  .trim()
  .min(2, 'فترة المستخلص يجب أن تتكون من حرفين على الأقل')
  .max(100, 'فترة المستخلص لا يمكن أن تتجاوز 100 حرف');

// ---------------------------------------------------------------------------
// Claim Date Schema
// Reuses parsing pattern from commitmentDateSchema in commitment.ts
// ---------------------------------------------------------------------------

function parseClaimDate(v: unknown): unknown {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return v;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? v : d;
  }
  return v;
}

/**
 * Claim date: the date the subcontractor submitted this billing claim.
 * Must be a valid date. Cannot be in the future.
 */
export const claimDateSchema = z.preprocess(
  parseClaimDate,
  z
    .date({ message: 'تاريخ المطالبة غير صالح' })
    .refine((date) => {
      // Allow 1 day tolerance for timezone differences (same as commitmentDateSchema)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return date <= tomorrow;
    }, 'تاريخ المطالبة لا يمكن أن يكون في المستقبل'),
);

// ---------------------------------------------------------------------------
// Create Billing Draft Schema
// ---------------------------------------------------------------------------

export const createBillingDraftSchema = z.object({
  projectId: z
    .string()
    .min(1, 'معرّف المشروع مطلوب')
    .cuid('معرّف المشروع غير صالح'),
  budgetLineId: z
    .string()
    .min(1, 'معرّف بند الموازنة مطلوب')
    .cuid('معرّف بند الموازنة غير صالح'),
  /** commitmentId is REQUIRED — design gate decision #2. */
  commitmentId: z
    .string()
    .min(1, 'معرّف الالتزام مطلوب')
    .cuid('معرّف الالتزام غير صالح'),
  subcontractorName: subcontractorNameSchema,
  referenceNumber: billingReferenceNumberSchema,
  billingPeriod: billingPeriodSchema,
  claimDate: claimDateSchema,
  grossAmount: moneyAmountSchema,
  description: z
    .string()
    .trim()
    .min(3, 'وصف نطاق العمل يجب أن يتكون من 3 أحرف على الأقل')
    .max(2000, 'وصف نطاق العمل لا يمكن أن يتجاوز 2000 حرف'),
});

export type CreateBillingDraftInput = z.infer<typeof createBillingDraftSchema>;

// ---------------------------------------------------------------------------
// Update Billing Draft Schema
// projectId and commitmentId are immutable after creation — excluded.
// budgetLineId is also immutable (commitment determines it).
// ---------------------------------------------------------------------------

export const updateBillingDraftSchema = z.object({
  subcontractorName: subcontractorNameSchema,
  referenceNumber: billingReferenceNumberSchema,
  billingPeriod: billingPeriodSchema,
  claimDate: claimDateSchema,
  grossAmount: moneyAmountSchema,
  description: z
    .string()
    .trim()
    .min(3, 'وصف نطاق العمل يجب أن يتكون من 3 أحرف على الأقل')
    .max(2000, 'وصف نطاق العمل لا يمكن أن يتجاوز 2000 حرف'),
});

export type UpdateBillingDraftInput = z.infer<typeof updateBillingDraftSchema>;

// ---------------------------------------------------------------------------
// Reject Billing Schema
// ---------------------------------------------------------------------------

export const rejectBillingSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(3, 'سبب الرفض يجب أن يتكون من 3 أحرف على الأقل')
    .max(500, 'سبب الرفض لا يمكن أن يتجاوز 500 حرف'),
});

export type RejectBillingInput = z.infer<typeof rejectBillingSchema>;

// ---------------------------------------------------------------------------
// Cancel Billing Schema
// cancellationReason is optional (Manager may cancel without written reason).
// Written to AuditLog when provided.
// ---------------------------------------------------------------------------

export const cancelBillingSchema = z.object({
  cancellationReason: z
    .string()
    .trim()
    .min(5, 'سبب الإلغاء يجب أن يتكون من 5 أحرف على الأقل')
    .max(500, 'سبب الإلغاء لا يمكن أن يتجاوز 500 حرف')
    .optional(),
});

export type CancelBillingInput = z.infer<typeof cancelBillingSchema>;

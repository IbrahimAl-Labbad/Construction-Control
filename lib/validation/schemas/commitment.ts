/**
 * lib/validation/schemas/commitment.ts
 *
 * Zod validation schemas for Project Commitment operations.
 * Single source of validation truth for the Commitment module.
 * Follows AGENTS.md §13 (financial validation) and §16 (Zod validation rules).
 */

import { z } from 'zod';
import { moneyAmountSchema } from './budget';

export { moneyAmountSchema };

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const commitmentIdSchema = z
  .string()
  .min(1, 'معرّف الالتزام مطلوب')
  .cuid('معرّف الالتزام غير صالح');

// ---------------------------------------------------------------------------
// Reference Number Normalization (Mandatory Correction 2)
// ---------------------------------------------------------------------------

/**
 * Normalizes reference number:
 * - Empty string or whitespace-only -> null
 * - Otherwise trim and validate length <= 100
 */
function normalizeReferenceNumber(v: unknown): unknown {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  }
  return v;
}

export const referenceNumberSchema = z.preprocess(
  normalizeReferenceNumber,
  z
    .string()
    .max(100, 'الرقم المرجعي لا يمكن أن يتجاوز 100 حرف')
    .nullable()
    .optional(),
);

// ---------------------------------------------------------------------------
// Vendor Name Schema
// ---------------------------------------------------------------------------

export const vendorNameSchema = z
  .string()
  .trim()
  .min(2, 'اسم المورد أو المقاول يجب أن يتكون من حرفين على الأقل')
  .max(150, 'اسم المورد أو المقاول لا يمكن أن يتجاوز 150 حرفاً');

// ---------------------------------------------------------------------------
// Commitment Date Schema
// ---------------------------------------------------------------------------

function parseCommitmentDate(v: unknown): unknown {
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
 * Validates commitment date. Must be a valid date and cannot be in the future.
 */
export const commitmentDateSchema = z.preprocess(
  parseCommitmentDate,
  z
    .date({
      message: 'تاريخ الالتزام غير صالح',
    })
    .refine((date) => {
      // Cannot be more than 1 day in the future (accounting for timezone differences)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return date <= tomorrow;
    }, 'تاريخ الالتزام لا يمكن أن يكون في المستقبل'),
);

// ---------------------------------------------------------------------------
// Create Commitment Draft Schema
// ---------------------------------------------------------------------------

export const createCommitmentDraftSchema = z.object({
  projectId: z
    .string()
    .min(1, 'معرّف المشروع مطلوب')
    .cuid('معرّف المشروع غير صالح'),
  budgetLineId: z
    .string()
    .min(1, 'معرّف بند الموازنة مطلوب')
    .cuid('معرّف بند الموازنة غير صالح'),
  vendorName: vendorNameSchema,
  referenceNumber: referenceNumberSchema,
  amount: moneyAmountSchema,
  commitmentDate: commitmentDateSchema,
  description: z
    .string()
    .trim()
    .min(3, 'وصف الالتزام يجب أن يتكون من 3 أحرف على الأقل')
    .max(1000, 'وصف الالتزام لا يمكن أن يتجاوز 1000 حرف'),
});

export type CreateCommitmentDraftInput = z.infer<typeof createCommitmentDraftSchema>;

// ---------------------------------------------------------------------------
// Update Commitment Draft Schema
// ---------------------------------------------------------------------------

export const updateCommitmentDraftSchema = z.object({
  budgetLineId: z
    .string()
    .min(1, 'معرّف بند الموازنة مطلوب')
    .cuid('معرّف بند الموازنة غير صالح'),
  vendorName: vendorNameSchema,
  referenceNumber: referenceNumberSchema,
  amount: moneyAmountSchema,
  commitmentDate: commitmentDateSchema,
  description: z
    .string()
    .trim()
    .min(3, 'وصف الالتزام يجب أن يتكون من 3 أحرف على الأقل')
    .max(1000, 'وصف الالتزام لا يمكن أن يتجاوز 1000 حرف'),
});

export type UpdateCommitmentDraftInput = z.infer<typeof updateCommitmentDraftSchema>;

// ---------------------------------------------------------------------------
// Reject Commitment Schema
// ---------------------------------------------------------------------------

export const rejectCommitmentSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(3, 'سبب الرفض يجب أن يتكون من 3 أحرف على الأقل')
    .max(500, 'سبب الرفض لا يمكن أن يتجاوز 500 حرف'),
});

export type RejectCommitmentInput = z.infer<typeof rejectCommitmentSchema>;

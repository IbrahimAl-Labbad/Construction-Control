/**
 * lib/validation/schemas/custody.ts
 *
 * Zod validation schemas for Project Custody / Advance operations.
 * Single source of validation truth for the Custody module.
 * Follows AGENTS.md §13 (financial validation) and §16 (Zod validation rules).
 */

import { z } from 'zod';
import { moneyAmountSchema } from './budget';

export { moneyAmountSchema };

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const custodyIdSchema = z
  .string()
  .min(1, 'معرّف العهدة مطلوب')
  .cuid('معرّف العهدة غير صالح');

// ---------------------------------------------------------------------------
// Operational Purpose Schema
// ---------------------------------------------------------------------------

export const custodyPurposeSchema = z
  .string()
  .trim()
  .min(10, 'الغرض التشغيلي من العهدة يجب أن يتكون من 10 أحرف على الأقل')
  .max(1000, 'الغرض التشغيلي لا يمكن أن يتجاوز 1000 حرف');

// ---------------------------------------------------------------------------
// Expected Settlement Date Schema
// ---------------------------------------------------------------------------

function parseOptionalDate(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return v;
}

export const expectedSettlementDateSchema = z
  .union([z.date(), z.string(), z.null(), z.undefined()])
  .transform((v) => parseOptionalDate(v) as Date | null);

// ---------------------------------------------------------------------------
// Create Custody Draft Schema
// ---------------------------------------------------------------------------

export const createCustodyDraftSchema = z.object({
  projectId: z
    .string()
    .min(1, 'معرّف المشروع مطلوب')
    .cuid('معرّف المشروع غير صالح'),
  budgetLineId: z
    .string()
    .min(1, 'معرّف بند الموازنة مطلوب')
    .cuid('معرّف بند الموازنة غير صالح'),
  custodianUserId: z
    .string()
    .min(1, 'أمين العهدة مطلوب')
    .cuid('معرّف أمين العهدة غير صالح'),
  amount: moneyAmountSchema,
  purpose: custodyPurposeSchema,
  expectedSettlementDate: expectedSettlementDateSchema.optional(),
});

export type CreateCustodyDraftInput = z.input<typeof createCustodyDraftSchema>;

// ---------------------------------------------------------------------------
// Update Custody Draft Schema
// ---------------------------------------------------------------------------

export const updateCustodyDraftSchema = z.object({
  id: custodyIdSchema,
  budgetLineId: z
    .string()
    .min(1, 'معرّف بند الموازنة مطلوب')
    .cuid('معرّف بند الموازنة غير صالح'),
  custodianUserId: z
    .string()
    .min(1, 'أمين العهدة مطلوب')
    .cuid('معرّف أمين العهدة غير صالح'),
  amount: moneyAmountSchema,
  purpose: custodyPurposeSchema,
  expectedSettlementDate: expectedSettlementDateSchema.optional(),
});

export type UpdateCustodyDraftInput = z.input<typeof updateCustodyDraftSchema>;

// ---------------------------------------------------------------------------
// Rejection Schema
// ---------------------------------------------------------------------------

export const rejectCustodySchema = z.object({
  id: custodyIdSchema,
  rejectionReason: z
    .string()
    .trim()
    .min(5, 'سبب الرفض يجب أن يتكون من 5 أحرف على الأقل')
    .max(1000, 'سبب الرفض لا يمكن أن يتجاوز 1000 حرف'),
});

export type RejectCustodyInput = z.infer<typeof rejectCustodySchema>;

// ---------------------------------------------------------------------------
// Pre-Issuance Cancellation Schema
// ---------------------------------------------------------------------------

export const cancelCustodySchema = z.object({
  id: custodyIdSchema,
  cancellationReason: z
    .string()
    .trim()
    .min(10, 'سبب الإلغاء يجب أن يتكون من 10 أحرف على الأقل')
    .max(1000, 'سبب الإلغاء لا يمكن أن يتجاوز 1000 حرف'),
});

export type CancelCustodyInput = z.infer<typeof cancelCustodySchema>;

// ---------------------------------------------------------------------------
// Cash Return Schema
// ---------------------------------------------------------------------------

export const recordCashReturnSchema = z.object({
  id: custodyIdSchema,
  amount: moneyAmountSchema,
});

export type RecordCashReturnInput = z.infer<typeof recordCashReturnSchema>;

/**
 * lib/validation/schemas/variation-order.ts
 *
 * Zod validation schemas for Variation Order / Change Order operations.
 * Single source of validation truth for the Variation Order module (Slice 20).
 *
 * Follows AGENTS.md §13 (financial validation) and §16 (Zod validation rules).
 * All inputs are strictly validated server-side before database access.
 */

import { z } from 'zod';

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
// Signed Financial Amount Schema
// ---------------------------------------------------------------------------

/**
 * Validates a signed monetary amount string with up to 2 decimal places.
 * Unlike standard expense/budget amounts, Variation Orders can represent:
 * - Cost increase (positive, e.g. "15000.00" or "+15000.00")
 * - Cost reduction (negative, e.g. "-5000.00")
 * - Cost neutral (zero, e.g. "0.00")
 */
export const signedMoneyAmountSchema = z.preprocess(
  (v) => {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      return trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
    }
    if (typeof v === 'number') {
      return String(v);
    }
    return v;
  },
  z
    .string()
    .min(1, 'مبلغ الأثر المالي مطلوب')
    .regex(
      /^-?\d+(\.\d{1,2})?$/,
      'مبلغ الأثر المالي يجب أن يكون رقماً صالحاً بدقة لا تتجاوز خانتين عشريتين (مثال: 1500.50 أو -500.00)',
    ),
);

/**
 * Quantity schema: non-negative decimal string with up to 4 decimal places.
 */
export const quantitySchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : v),
  z
    .string()
    .min(1, 'الكمية مطلوبة')
    .regex(
      /^\d+(\.\d{1,4})?$/,
      'الكمية يجب أن تكون رقماً موجباً أو صفراً بدقة تصل إلى 4 خانات عشرية',
    ),
);

/**
 * Unit rate schema: non-negative decimal string with up to 2 decimal places.
 */
export const unitRateSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : v),
  z
    .string()
    .min(1, 'السعر الفردي مطلوب')
    .regex(
      /^\d+(\.\d{1,2})?$/,
      'السعر الفردي يجب أن يكون رقماً موجباً أو صفراً بدقة لا تتجاوز خانتين عشريتين',
    ),
);

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const variationOrderIdSchema = z
  .string()
  .min(1, 'معرّف أمر التغيير مطلوب')
  .cuid('معرّف أمر التغيير غير صالح');

// ---------------------------------------------------------------------------
// Variation Order Line Schema
// ---------------------------------------------------------------------------

export const variationOrderLineInputSchema = z.object({
  id: z.string().cuid().optional(),
  description: z
    .string()
    .trim()
    .min(2, 'وصف البند يجب أن يكون حرفين على الأقل')
    .max(1000, 'وصف البند لا يمكن أن يتجاوز 1000 حرف'),
  unit: z
    .string()
    .trim()
    .min(1, 'وحدة القياس مطلوبة')
    .max(50, 'وحدة القياس لا يمكن أن تتجاوز 50 حرفاً'),
  originalQuantity: quantitySchema,
  revisedQuantity: quantitySchema,
  originalRate: unitRateSchema,
  revisedRate: unitRateSchema,
  notes: z.preprocess(
    emptyToNull,
    z.string().max(1000, 'الملاحظات لا يمكن أن تتجاوز 1000 حرف').nullable().optional(),
  ),
});

export type VariationOrderLineInput = z.infer<typeof variationOrderLineInputSchema>;

// ---------------------------------------------------------------------------
// Create Variation Order Schema
// ---------------------------------------------------------------------------

export const createVariationOrderSchema = z.object({
  projectId: z.string().cuid('معرّف المشروع غير صالح'),
  title: z
    .string()
    .trim()
    .min(3, 'عنوان أمر التغيير يجب أن يكون 3 أحرف على الأقل')
    .max(200, 'عنوان أمر التغيير لا يمكن أن يتجاوز 200 حرف'),
  description: z
    .string()
    .trim()
    .min(5, 'وصف التغيير يجب أن يكون 5 أحرف على الأقل')
    .max(5000, 'وصف التغيير لا يمكن أن يتجاوز 5000 حرف'),
  reason: z
    .string()
    .trim()
    .min(5, 'المبرر الفني / الميداني يجب أن يكون 5 أحرف على الأقل')
    .max(5000, 'المبرر الفني لا يمكن أن يتجاوز 5000 حرف'),
  scopeImpact: z.preprocess(
    emptyToNull,
    z.string().max(5000, 'أثر نطاق العمل لا يمكن أن يتجاوز 5000 حرف').nullable().optional(),
  ),
  budgetLineId: z.preprocess(
    emptyToNull,
    z.string().cuid('معرّف بند الموازنة غير صالح').nullable().optional(),
  ),
  commitmentId: z.preprocess(
    emptyToNull,
    z.string().cuid('معرّف الارتباط التعاقدي غير صالح').nullable().optional(),
  ),
  /**
   * If line items are provided, impactAmount is computed server-side from lines.
   * If line items are omitted (lump-sum variation), impactAmount is required.
   */
  impactAmount: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? undefined : v),
    signedMoneyAmountSchema.optional(),
  ),
  lines: z.array(variationOrderLineInputSchema).optional().default([]),
});

export type CreateVariationOrderInput = z.infer<typeof createVariationOrderSchema>;

// ---------------------------------------------------------------------------
// Update Variation Order Schema (DRAFT only)
// ---------------------------------------------------------------------------

export const updateVariationOrderSchema = z.object({
  id: variationOrderIdSchema,
  title: z
    .string()
    .trim()
    .min(3, 'عنوان أمر التغيير يجب أن يكون 3 أحرف على الأقل')
    .max(200, 'عنوان أمر التغيير لا يمكن أن يتجاوز 200 حرف'),
  description: z
    .string()
    .trim()
    .min(5, 'وصف التغيير يجب أن يكون 5 أحرف على الأقل')
    .max(5000, 'وصف التغيير لا يمكن أن يتجاوز 5000 حرف'),
  reason: z
    .string()
    .trim()
    .min(5, 'المبرر الفني / الميداني يجب أن يكون 5 أحرف على الأقل')
    .max(5000, 'المبرر الفني لا يمكن أن يتجاوز 5000 حرف'),
  scopeImpact: z.preprocess(
    emptyToNull,
    z.string().max(5000, 'أثر نطاق العمل لا يمكن أن يتجاوز 5000 حرف').nullable().optional(),
  ),
  budgetLineId: z.preprocess(
    emptyToNull,
    z.string().cuid('معرّف بند الموازنة غير صالح').nullable().optional(),
  ),
  commitmentId: z.preprocess(
    emptyToNull,
    z.string().cuid('معرّف الارتباط التعاقدي غير صالح').nullable().optional(),
  ),
  impactAmount: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? undefined : v),
    signedMoneyAmountSchema.optional(),
  ),
  lines: z.array(variationOrderLineInputSchema).optional().default([]),
});

export type UpdateVariationOrderInput = z.infer<typeof updateVariationOrderSchema>;

// ---------------------------------------------------------------------------
// Lifecycle Action Schemas
// ---------------------------------------------------------------------------

export const submitVariationOrderSchema = z.object({
  id: variationOrderIdSchema,
});
export type SubmitVariationOrderInput = z.infer<typeof submitVariationOrderSchema>;

export const approveVariationOrderSchema = z.object({
  id: variationOrderIdSchema,
});
export type ApproveVariationOrderInput = z.infer<typeof approveVariationOrderSchema>;

export const rejectVariationOrderSchema = z.object({
  id: variationOrderIdSchema,
  rejectionReason: z
    .string()
    .trim()
    .min(3, 'سبب الرفض يجب أن يكون 3 أحرف على الأقل')
    .max(1000, 'سبب الرفض لا يمكن أن يتجاوز 1000 حرف'),
});
export type RejectVariationOrderInput = z.infer<typeof rejectVariationOrderSchema>;

export const reopenVariationOrderSchema = z.object({
  id: variationOrderIdSchema,
});
export type ReopenVariationOrderInput = z.infer<typeof reopenVariationOrderSchema>;

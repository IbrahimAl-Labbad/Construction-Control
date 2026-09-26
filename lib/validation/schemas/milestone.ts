/**
 * lib/validation/schemas/milestone.ts
 *
 * Zod validation schemas for Project Planning & Milestones.
 * Single source of validation truth for the Milestone module.
 *
 * Vertical Slice 12 — Project Planning & Milestones.
 * Follows AGENTS.md §16 (Zod validation rules).
 *
 * Locked rules enforced:
 * - BD-12-05 / BD-12-09: status constraints
 * - title: 2–150 chars, trimmed, non-empty
 * - description: optional, <= 1000 chars
 * - targetDate: YYYY-MM-DD calendar date
 * - cancellationReason: required on cancel, <= 500 chars
 * - reorder: array of distinct cuid strings
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers: Preprocessors
// ---------------------------------------------------------------------------

function emptyToNull(v: unknown): unknown {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  }
  return v;
}

function parseTargetDate(v: unknown): unknown {
  if (v instanceof Date) return isNaN(v.getTime()) ? v : v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return v;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parts = trimmed.split('-');
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      const date = new Date(Date.UTC(year, month - 1, day));
      return isNaN(date.getTime()) ? v : date;
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? v : d;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const milestoneIdSchema = z
  .string()
  .min(1, 'معرّف المحطة مطلوب')
  .cuid('معرّف المحطة غير صالح');

export const projectIdSchema = z
  .string()
  .min(1, 'معرّف المشروع مطلوب')
  .cuid('معرّف المشروع غير صالح');

// ---------------------------------------------------------------------------
// Field Schemas
// ---------------------------------------------------------------------------

export const milestoneTitleSchema = z
  .string()
  .trim()
  .min(2, 'عنوان المحطة يجب أن يتكون من حرفين على الأقل')
  .max(150, 'عنوان المحطة لا يمكن أن يتجاوز 150 حرفاً');

export const milestoneDescriptionSchema = z.preprocess(
  emptyToNull,
  z.string().max(1000, 'الوصف لا يمكن أن يتجاوز 1000 حرف').nullable().optional().default(null),
);

export const milestoneTargetDateSchema = z.preprocess(
  parseTargetDate,
  z.date({
    message: 'التاريخ المستهدف غير صالح',
  }),
);

export const milestoneCancellationReasonSchema = z
  .string()
  .trim()
  .min(1, 'سبب الإلغاء مطلوب')
  .max(500, 'سبب الإلغاء لا يمكن أن يتجاوز 500 حرف');

// ---------------------------------------------------------------------------
// Operation Schemas
// ---------------------------------------------------------------------------

export const createMilestoneSchema = z.object({
  projectId: projectIdSchema,
  title: milestoneTitleSchema,
  description: milestoneDescriptionSchema,
  targetDate: milestoneTargetDateSchema,
});

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneMetadataSchema = z
  .object({
    title: milestoneTitleSchema.optional(),
    description: z.preprocess(
      emptyToNull,
      z.string().max(1000, 'الوصف لا يمكن أن يتجاوز 1000 حرف').nullable().optional(),
    ),
    targetDate: milestoneTargetDateSchema.optional(),
    reason: z.string().trim().max(500, 'سبب التعديل لا يمكن أن يتجاوز 500 حرف').optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.targetDate !== undefined,
    {
      message: 'يجب تقديم حقل واحد على الأقل للتحديث',
    },
  );

export type UpdateMilestoneMetadataInput = z.infer<typeof updateMilestoneMetadataSchema>;

export const cancelMilestoneSchema = z.object({
  cancellationReason: milestoneCancellationReasonSchema,
});

export type CancelMilestoneInput = z.infer<typeof cancelMilestoneSchema>;

export const reorderMilestonesSchema = z.object({
  projectId: projectIdSchema,
  milestoneIds: z
    .array(milestoneIdSchema)
    .min(1, 'يجب تقديم قائمة معالم لإعادة الترتيب')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'لا يمكن تكرار معرّف المحطة في قائمة إعادة الترتيب',
    }),
});

export type ReorderMilestonesInput = z.infer<typeof reorderMilestonesSchema>;

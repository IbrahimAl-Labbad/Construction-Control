/**
 * lib/validation/schemas/progress-report.ts
 *
 * Zod validation schemas for Site Engineer Progress Reports.
 * Single source of validation truth for the Progress Report module.
 *
 * Vertical Slice 10 — Progress Reports by Site Engineer.
 * Follows AGENTS.md §16 (Zod validation rules).
 *
 * Locked rules enforced:
 * - BD-05 / BD-05b: reportDate <= server.now() + 1 day
 * - BD-09: title (≤ 150), workDescription (≤ 3000), blockers (≤ 1500), nextPeriodPlan (≤ 1500), weatherCondition (≤ 100)
 * - BD-10: progressPercentage integer 0–100, optional
 * - No invented maximums or mandatory requirements for rejectionReason / cancellationReason
 */

import { z } from 'zod';
import { ProgressReportStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export const progressReportIdSchema = z
  .string()
  .min(1, 'معرّف تقرير التقدم مطلوب')
  .cuid('معرّف تقرير التقدم غير صالح');

export const projectIdSchema = z
  .string()
  .min(1, 'معرّف المشروع مطلوب')
  .cuid('معرّف المشروع غير صالح');

// ---------------------------------------------------------------------------
// Helpers: Preprocessors
// ---------------------------------------------------------------------------

function parseReportDate(v: unknown): unknown {
  if (v instanceof Date) return isNaN(v.getTime()) ? v : v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return v;
    // If YYYY-MM-DD, construct date safely
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parts = trimmed.split('-');
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      return new Date(Date.UTC(year, month - 1, day));
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? v : d;
  }
  return v;
}

function trimOptionalText(v: unknown): unknown {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (v === undefined) return null;
  return v;
}

// ---------------------------------------------------------------------------
// Date Validation (BD-05 / BD-05b)
// ---------------------------------------------------------------------------

/**
 * Validates reportDate. Must be a valid date and cannot be more than 1 day in the future (BD-05b).
 */
export const reportDateSchema = z.preprocess(
  parseReportDate,
  z
    .date({
      message: 'تاريخ التقرير غير صالح',
    })
    .refine((date) => {
      // 1-day server-side tolerance (BD-05b)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return date <= tomorrow;
    }, 'تاريخ التقرير غير صالح، يتجاوز النطاق الزمني المسموح به (لا يمكن أن يتجاوز تاريخ الغد)'),
);

// ---------------------------------------------------------------------------
// Progress Percentage Validation (BD-10)
// ---------------------------------------------------------------------------

export const progressPercentageSchema = z
  .number()
  .int('نسبة الإنجاز يجب أن تكون رقماً صحيحاً بدون كسور')
  .min(0, 'نسبة الإنجاز يجب أن تكون بين 0 و 100')
  .max(100, 'نسبة الإنجاز يجب أن تكون بين 0 و 100')
  .nullable()
  .optional();

// ---------------------------------------------------------------------------
// Free Text Schemas
// ---------------------------------------------------------------------------

export const titleSchema = z
  .string()
  .trim()
  .min(1, 'عنوان التقرير مطلوب')
  .max(150, 'عنوان التقرير لا يمكن أن يتجاوز 150 حرفاً');

export const workDescriptionSchema = z
  .string()
  .trim()
  .min(1, 'وصف الأعمال المنجزة مطلوب')
  .max(3000, 'وصف الأعمال لا يمكن أن يتجاوز 3000 حرف');

export const blockersSchema = z.preprocess(
  trimOptionalText,
  z.string().max(1500, 'المعوقات والملاحظات لا يمكن أن تتجاوز 1500 حرف').nullable().optional(),
);

export const nextPeriodPlanSchema = z.preprocess(
  trimOptionalText,
  z.string().max(1500, 'خطة الفترة القادمة لا يمكن أن تتجاوز 1500 حرف').nullable().optional(),
);

export const weatherConditionSchema = z.preprocess(
  trimOptionalText,
  z.string().max(100, 'حالة الطقس لا يمكن أن تتجاوز 100 حرف').nullable().optional(),
);

export const rejectionReasonSchema = z.preprocess(
  trimOptionalText,
  z.string().nullable().optional(),
);

export const cancellationReasonSchema = z.preprocess(
  trimOptionalText,
  z.string().nullable().optional(),
);

// ---------------------------------------------------------------------------
// Operation Schemas
// ---------------------------------------------------------------------------

export const createProgressReportDraftSchema = z.object({
  projectId: projectIdSchema,
  reportDate: reportDateSchema,
  title: titleSchema,
  workDescription: workDescriptionSchema,
  progressPercentage: progressPercentageSchema,
  blockers: blockersSchema,
  nextPeriodPlan: nextPeriodPlanSchema,
  weatherCondition: weatherConditionSchema,
});

export const updateProgressReportDraftSchema = z.object({
  title: titleSchema.optional(),
  workDescription: workDescriptionSchema.optional(),
  progressPercentage: progressPercentageSchema,
  blockers: blockersSchema,
  nextPeriodPlan: nextPeriodPlanSchema,
  weatherCondition: weatherConditionSchema,
});

export const rejectProgressReportSchema = z.object({
  rejectionReason: rejectionReasonSchema,
});

export const cancelProgressReportSchema = z.object({
  cancellationReason: cancellationReasonSchema,
});

export const progressReportFiltersSchema = z.object({
  projectId: projectIdSchema.optional(),
  status: z.nativeEnum(ProgressReportStatus).optional(),
});

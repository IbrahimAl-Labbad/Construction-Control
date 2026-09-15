/**
 * lib/validation/schemas/project.ts
 *
 * Zod validation schemas for Project domain operations.
 *
 * Single source of validation truth for Projects.
 * Follows AGENTS.md §16 validation rules.
 */

import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';

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

function parseDateOrNull(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? v : d;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Project code schema
// ---------------------------------------------------------------------------

export const projectCodeSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
  z
    .string()
    .min(2, 'كود المشروع يجب أن يتكون من حرفين على الأقل')
    .max(20, 'كود المشروع لا يمكن أن يتجاوز 20 حرفاً')
    .regex(
      /^[A-Z0-9_-]{2,20}$/,
      'كود المشروع يجب أن يتكون من أحرف إنجليزية كبيرة، أرقام، أو شرطات (- _)',
    ),
);

// ---------------------------------------------------------------------------
// Project name schema
// ---------------------------------------------------------------------------

export const projectNameSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : v),
  z
    .string()
    .min(2, 'اسم المشروع يجب أن يكون حرفين على الأقل')
    .max(150, 'اسم المشروع لا يمكن أن يتجاوز 150 حرفاً'),
);

// ---------------------------------------------------------------------------
// Create project schema
// ---------------------------------------------------------------------------

export const createProjectSchema = z
  .object({
    code: projectCodeSchema,
    name: projectNameSchema,
    description: z.preprocess(
      emptyToNull,
      z
        .string()
        .max(1000, 'الوصف لا يمكن أن يتجاوز 1000 حرف')
        .nullable()
        .optional()
        .default(null),
    ),
    location: z.preprocess(
      emptyToNull,
      z
        .string()
        .max(200, 'الموقع لا يمكن أن يتجاوز 200 حرف')
        .nullable()
        .optional()
        .default(null),
    ),
    managerId: z.string().min(1, 'معرّف مدير المشروع مطلوب'),
    startDate: z.preprocess(
      parseDateOrNull,
      z.date().nullable().optional().default(null),
    ),
    endDate: z.preprocess(
      parseDateOrNull,
      z.date().nullable().optional().default(null),
    ),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'تاريخ الانتهاء يجب أن يكون مساوياً أو لاحقاً لتاريخ البدء',
      path: ['endDate'],
    },
  );

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// ---------------------------------------------------------------------------
// Project ID schema
// ---------------------------------------------------------------------------

export const projectIdSchema = z.string().min(1, 'معرّف المشروع مطلوب');

export type ProjectIdInput = z.infer<typeof projectIdSchema>;

// ---------------------------------------------------------------------------
// Reason (optional) schema — shared across Phase B operations
// ---------------------------------------------------------------------------

const optionalReasonSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : v),
  z
    .string()
    .max(500, 'السبب لا يمكن أن يتجاوز 500 حرف')
    .nullable()
    .optional()
    .default(null),
);

// ---------------------------------------------------------------------------
// Update project schema (metadata-only — status is NOT updatable here)
// ---------------------------------------------------------------------------

export const updateProjectSchema = z
  .object({
    name: projectNameSchema,
    description: z.preprocess(
      emptyToNull,
      z
        .string()
        .max(1000, 'الوصف لا يمكن أن يتجاوز 1000 حرف')
        .nullable()
        .optional()
        .default(null),
    ),
    location: z.preprocess(
      emptyToNull,
      z
        .string()
        .max(200, 'الموقع لا يمكن أن يتجاوز 200 حرف')
        .nullable()
        .optional()
        .default(null),
    ),
    startDate: z.preprocess(
      parseDateOrNull,
      z.date().nullable().optional().default(null),
    ),
    endDate: z.preprocess(
      parseDateOrNull,
      z.date().nullable().optional().default(null),
    ),
    reason: optionalReasonSchema,
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'تاريخ الانتهاء يجب أن يكون مساوياً أو لاحقاً لتاريخ البدء',
      path: ['endDate'],
    },
  );

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// ---------------------------------------------------------------------------
// Change project status schema
// ---------------------------------------------------------------------------

export const changeProjectStatusSchema = z.object({
  newStatus: z.nativeEnum(ProjectStatus, {
    error: 'حالة المشروع غير صالحة',
  }),
  reason: optionalReasonSchema,
});

export type ChangeProjectStatusInput = z.infer<typeof changeProjectStatusSchema>;

// ---------------------------------------------------------------------------
// Assign manager schema
// ---------------------------------------------------------------------------

export const assignManagerSchema = z.object({
  newManagerId: z.string().min(1, 'معرّف المدير الجديد مطلوب'),
  reason: optionalReasonSchema,
});

export type AssignManagerInput = z.infer<typeof assignManagerSchema>;

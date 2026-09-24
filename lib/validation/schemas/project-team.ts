/**
 * lib/validation/schemas/project-team.ts
 *
 * Zod validation schemas for Project Team & Engineer Assignment operations.
 * Single source of validation truth for the project team domain.
 *
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 * Follows AGENTS.md §16 (strict server-side validation).
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
// Identifiers (Strict CUID Validation)
// ---------------------------------------------------------------------------

export const projectIdSchema = z
  .string()
  .min(1, 'معرّف المشروع مطلوب')
  .cuid('معرّف المشروع غير صالح');

export const engineerIdSchema = z
  .string()
  .min(1, 'معرّف المهندس مطلوب')
  .cuid('معرّف المهندس غير صالح');

export const assignmentIdSchema = z
  .string()
  .min(1, 'معرّف التعيين مطلوب')
  .cuid('معرّف التعيين غير صالح');

// ---------------------------------------------------------------------------
// Mutation Schemas
// ---------------------------------------------------------------------------

export const assignEngineerSchema = z.object({
  projectId: projectIdSchema,
  engineerId: engineerIdSchema,
  reason: z.preprocess(
    emptyToNull,
    z
      .string()
      .max(500, 'الملاحظات لا يمكن أن تتجاوز 500 حرف')
      .nullable()
      .optional()
      .default(null),
  ),
});

export const removeEngineerSchema = z.object({
  projectId: projectIdSchema,
  assignmentId: assignmentIdSchema,
  reason: z.preprocess(
    emptyToNull,
    z
      .string()
      .max(500, 'سبب إلغاء التعيين لا يمكن أن يتجاوز 500 حرف')
      .nullable()
      .optional()
      .default(null),
  ),
});

export type AssignEngineerInput = z.infer<typeof assignEngineerSchema>;
export type RemoveEngineerInput = z.infer<typeof removeEngineerSchema>;

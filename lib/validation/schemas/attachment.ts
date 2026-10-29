/**
 * lib/validation/schemas/attachment.ts
 *
 * Zod validation schemas for Attachment Infrastructure — Wave 0.
 *
 * Enforces:
 * - Strictly typed ownerType and category enums
 * - Required non-empty IDs for projectId and ownerId
 * - Optional supersedesId for atomic replacement
 * - Mandatory non-empty trimmed reason for voiding and replacement (R-06)
 *
 * Follows AGENTS.md §12, §16, §26 (client-safe pure validation).
 */

import { z } from 'zod';

export const ATTACHMENT_OWNER_TYPES = [
  'EXPENSE',
  'PROGRESS_REPORT',
  'SUBCONTRACTOR_BILLING',
  'VARIATION_ORDER',
  'CUSTODY_ADVANCE',
  'MATERIAL_RECEIVING_NOTE',
] as const;

export const ATTACHMENT_CATEGORIES = [
  'EXECUTION_EVIDENCE',
  'PROGRESS_PHOTO',
  'RECEIPT',
  'DELIVERY_NOTE',
  'INVOICE',
  'SUPPORTING_DOCUMENT',
  'AUDIT_EVIDENCE',
] as const;

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedAttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

/** Maximum file size: 10 MiB (10 * 1024 * 1024 = 10,485,760 bytes) */
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const attachmentIdSchema = z
  .string({ message: 'معرّف المرفق مطلوب' })
  .trim()
  .min(1, 'معرّف المرفق مطلوب')
  .max(100, 'معرّف المرفق غير صالح');

export const attachmentOwnerTypeSchema = z.enum(ATTACHMENT_OWNER_TYPES, {
  message: 'نوع السجل المرتبط بالمرفق غير صالح',
});

export const attachmentCategorySchema = z.enum(ATTACHMENT_CATEGORIES, {
  message: 'تصنيف المرفق غير صالح',
});

export const uploadAttachmentMetadataSchema = z.object({
  projectId: z
    .string({ message: 'معرّف المشروع مطلوب' })
    .trim()
    .min(1, 'معرّف المشروع مطلوب')
    .max(100, 'معرّف المشروع غير صالح'),
  ownerType: attachmentOwnerTypeSchema,
  ownerId: z
    .string({ message: 'معرّف السجل الأصلي مطلوب' })
    .trim()
    .min(1, 'معرّف السجل الأصلي مطلوب')
    .max(100, 'معرّف السجل الأصلي غير صالح'),
  category: attachmentCategorySchema.default('SUPPORTING_DOCUMENT'),
  originalFileName: z
    .string({ message: 'اسم الملف مطلوب' })
    .min(1, 'اسم الملف مطلوب')
    .max(512, 'اسم الملف طويل جداً'),
  declaredMimeType: z
    .string()
    .trim()
    .max(100, 'نوع الملف المعلن غير صالح')
    .optional(),
  supersedesId: z
    .string()
    .trim()
    .min(1, 'معرّف المرفق المستبدل غير صالح')
    .max(100, 'معرّف المرفق المستبدل غير صالح')
    .optional(),
  replacementReason: z
    .string()
    .trim()
    .min(3, 'سبب الاستبدال يجب أن لا يقل عن 3 أحرف')
    .max(1000, 'سبب الاستبدال لا يمكن أن يتجاوز 1000 حرف')
    .optional(),
});

export type UploadAttachmentMetadataInput = z.infer<typeof uploadAttachmentMetadataSchema>;

export const voidAttachmentSchema = z.object({
  attachmentId: attachmentIdSchema,
  reason: z
    .string({ message: 'سبب إلغاء المرفق مطلوب' })
    .trim()
    .min(3, 'سبب إلغاء المرفق يجب أن لا يقل عن 3 أحرف')
    .max(1000, 'سبب إلغاء المرفق لا يمكن أن يتجاوز 1000 حرف'),
});

export type VoidAttachmentInput = z.infer<typeof voidAttachmentSchema>;

export const listAttachmentsForOwnerSchema = z.object({
  projectId: z
    .string({ message: 'معرّف المشروع مطلوب' })
    .trim()
    .min(1, 'معرّف المشروع مطلوب')
    .max(100, 'معرّف المشروع غير صالح'),
  ownerType: attachmentOwnerTypeSchema,
  ownerId: z
    .string({ message: 'معرّف السجل الأصلي مطلوب' })
    .trim()
    .min(1, 'معرّف السجل الأصلي مطلوب')
    .max(100, 'معرّف السجل الأصلي غير صالح'),
  includeVoided: z.boolean().optional().default(false),
});

export type ListAttachmentsForOwnerInput = z.infer<typeof listAttachmentsForOwnerSchema>;


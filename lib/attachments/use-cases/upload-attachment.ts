/**
 * lib/attachments/use-cases/upload-attachment.ts
 *
 * Use case: Uploads a validated evidence file, persists Attachment metadata
 * (and optional supersession of a prior draft attachment), and records an
 * append-only AuditLog entry (`ATTACHMENT_UPLOADED` or `ATTACHMENT_REPLACED`).
 *
 * Enforces (AGENTS.md §12, §18, §21; Addendum §9):
 * 1. Server-side authentication via `requireAuth()` (never trusts client uploader ID).
 * 2. Strict Zod metadata validation + magic-byte, size, extension, and filename validation
 *    BEFORE touching storage or database.
 * 3. Pre-check of parent record authorization and DRAFT mutability before writing to storage.
 * 4. Writes validated bytes to the backend-neutral `AttachmentStorageProvider` using a
 *    server-generated opaque `storageKey`.
 * 5. Inside `prisma.$transaction`:
 *    - Locks the parent record row (`SELECT ... FOR UPDATE`) and re-verifies ownership,
 *      project linkage, and DRAFT mutability.
 *    - If `supersedesId` is provided, locks the superseded attachment row, verifies it
 *      belongs to the exact same `(projectId, ownerType, ownerId)`, was uploaded by the actor,
 *      is not already voided or superseded, and marks it voided.
 *    - Inserts the `Attachment` row and the `ATTACHMENT_UPLOADED` / `ATTACHMENT_REPLACED`
 *      audit log entry atomically.
 * 6. Compensating storage cleanup: if the database transaction fails for any reason after
 *    `storage.putObject()` succeeded, deletes the orphaned object from storage before
 *    re-throwing the error.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireAuth } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { uploadAttachmentMetadataSchema } from '@/lib/validation/schemas/attachment';
import { validateAttachmentFile } from '../file-validation';
import { ATTACHMENT_INCLUDE, toAttachmentSummaryDTO, type AttachmentQueryRow } from '../mappers';
import { resolveAndAuthorizeOwnerAccess } from '../owner-access';
import { getAttachmentStorageProvider } from '../storage';
import type { AttachmentSummaryDTO, UploadAttachmentInput } from '../types';

export async function uploadAttachment(
  rawInput: UploadAttachmentInput,
): Promise<AttachmentSummaryDTO> {
  // 1. Server-side authentication
  const actor = await requireAuth();

  if (!rawInput || typeof rawInput !== 'object') {
    throw new ValidationError([{ path: '', message: 'بيانات المرفق مطلوبة' }]);
  }

  // 2. Validate metadata with Zod
  const metaValidation = validate(uploadAttachmentMetadataSchema, {
    projectId: rawInput.projectId,
    ownerType: rawInput.ownerType,
    ownerId: rawInput.ownerId,
    category: rawInput.category,
    originalFileName: rawInput.originalFileName,
    declaredMimeType: rawInput.declaredMimeType,
    supersedesId: rawInput.supersedesId,
    replacementReason: rawInput.replacementReason,
  });

  if (!metaValidation.success) {
    throw new ValidationError(metaValidation.errors);
  }

  const meta = metaValidation.data;

  // 3. Validate file content, size, magic bytes, extension, and display filename BEFORE storage/DB
  const validatedFile = validateAttachmentFile({
    originalFileName: meta.originalFileName,
    declaredMimeType: meta.declaredMimeType,
    content: rawInput.content,
  });

  // 4. Pre-validate parent record authorization & mutability before writing object to storage
  await resolveAndAuthorizeOwnerAccess({
    tx: prisma,
    actor,
    projectId: meta.projectId,
    ownerType: meta.ownerType,
    ownerId: meta.ownerId,
    intent: 'MUTATE_DRAFT',
    lockParentRow: false,
  });

  // 5. Store validated file via storage provider abstraction
  const storage = getAttachmentStorageProvider();
  const storedObject = await storage.putObject({
    bytes: validatedFile.bytes,
    mimeType: validatedFile.verifiedMimeType,
    sizeBytes: validatedFile.sizeBytes,
    checksumSha256: validatedFile.checksumSha256,
  });

  // 6. Persist metadata & audit trail inside atomic transaction; clean up storage on failure
  const now = new Date();
  try {
    const createdRow = await prisma.$transaction(async (tx) => {
      // 6.1 Lock parent record (Level 6) and re-verify mutability & ownership
      await resolveAndAuthorizeOwnerAccess({
        tx,
        actor,
        projectId: meta.projectId,
        ownerType: meta.ownerType,
        ownerId: meta.ownerId,
        intent: 'MUTATE_DRAFT',
        lockParentRow: true,
      });

      // 6.2 If superseding an existing attachment, lock and validate the prior attachment
      if (meta.supersedesId) {
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`
            SELECT id FROM attachments WHERE id = ${meta.supersedesId} FOR UPDATE
          `;
        }

        const prior = await tx.attachment.findFirst({
          where: {
            id: meta.supersedesId,
            projectId: meta.projectId,
            ownerType: meta.ownerType,
            ownerId: meta.ownerId,
          },
          include: {
            supersededBy: { select: { id: true } },
          },
        });

        if (!prior) {
          throw new AppError(
            'NOT_FOUND',
            'المرفق المراد استبداله غير موجود أو لا ينتمي لنفس السجل والمشروع',
          );
        }

        if (prior.uploadedById !== actor.id) {
          throw new AppError('FORBIDDEN', 'لا يمكنك استبدال مرفق قام برفعه مستخدم آخر');
        }

        if (prior.supersededBy) {
          throw new AppError(
            'ATTACHMENT_ALREADY_SUPERSEDED',
            'تم استبدال هذا المرفق مسبقاً بمرفق آخر',
          );
        }

        if (prior.voidedAt !== null) {
          throw new AppError(
            'ATTACHMENT_ALREADY_VOIDED',
            'لا يمكن استبدال مرفق تم إلغاؤه مسبقاً',
          );
        }

        // Mark the superseded attachment as voided so only the replacement remains active
        await tx.attachment.update({
          where: { id: prior.id },
          data: {
            voidedAt: now,
            voidedById: actor.id,
            voidReason: meta.replacementReason ?? 'تم استبدال المرفق بنسخة محدثة',
          },
        });
      }

      // 6.3 Create the new Attachment metadata row
      const attachment = await tx.attachment.create({
        data: {
          projectId: meta.projectId,
          ownerType: meta.ownerType,
          ownerId: meta.ownerId,
          category: meta.category,
          originalFileName: validatedFile.normalizedFileName,
          storageKey: storedObject.storageKey,
          mimeType: validatedFile.verifiedMimeType,
          sizeBytes: validatedFile.sizeBytes,
          checksumSha256: validatedFile.checksumSha256,
          uploadedById: actor.id,
          supersedesId: meta.supersedesId ?? null,
        },
        include: ATTACHMENT_INCLUDE,
      });

      // 6.4 Write append-only AuditLog in the SAME transaction
      const auditAction = meta.supersedesId ? 'ATTACHMENT_REPLACED' : 'ATTACHMENT_UPLOADED';
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: auditAction,
          entityType: 'ATTACHMENT',
          entityId: attachment.id,
          metadata: {
            projectId: attachment.projectId,
            ownerType: attachment.ownerType,
            ownerId: attachment.ownerId,
            category: attachment.category,
            originalFileName: attachment.originalFileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            checksumSha256: attachment.checksumSha256,
            supersedesId: attachment.supersedesId,
            ...(meta.replacementReason ? { replacementReason: meta.replacementReason } : {}),
          },
        },
      });

      return attachment;
    });

    return toAttachmentSummaryDTO(createdRow as unknown as AttachmentQueryRow);
  } catch (error) {
    // Compensating cleanup: remove orphaned storage object when DB transaction fails
    try {
      await storage.deleteObject(storedObject.storageKey);
    } catch (cleanupError) {
      logger.error('attachments.orphan_cleanup_failed', {
        errorName: cleanupError instanceof Error ? cleanupError.name : 'UnknownError',
      });
    }
    throw error;
  }
}


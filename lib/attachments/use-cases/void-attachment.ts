/**
 * lib/attachments/use-cases/void-attachment.ts
 *
 * Use case: Voids an attachment on an editable parent record (`DRAFT`) while
 * preserving the metadata row in the database (`voidedAt`, `voidedById`, `voidReason`)
 * and recording an `ATTACHMENT_VOIDED` AuditLog entry in the same transaction.
 *
 * Enforces (AGENTS.md §12, §14, §18, §21; Addendum §9):
 * 1. Server-side authentication via `requireAuth()`.
 * 2. Strict Zod validation of `attachmentId` and mandatory trimmed `reason` (R-06).
 * 3. Locks the parent record row (`SELECT ... FOR UPDATE`) and verifies:
 *    - Parent record exists, belongs to `attachment.projectId`, and is in `DRAFT` status.
 *    - Actor is the authorized uploader (`attachment.uploadedById === actor.id`).
 *    - Parent status is not `SUBMITTED`, `AUDITED`, `APPROVED`, `CANCELLED`, or `REVERSED`.
 * 4. Locks the attachment row (`SELECT ... FOR UPDATE`), verifies it is not already voided,
 *    marks `voidedAt`, `voidedById`, `voidReason`, and writes `ATTACHMENT_VOIDED` AuditLog
 *    in the exact same transaction.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { voidAttachmentSchema } from '@/lib/validation/schemas/attachment';
import { ATTACHMENT_INCLUDE, toAttachmentSummaryDTO, type AttachmentQueryRow } from '../mappers';
import { resolveAndAuthorizeOwnerAccess } from '../owner-access';
import type { AttachmentSummaryDTO } from '../types';

export async function voidAttachment(rawInput: unknown): Promise<AttachmentSummaryDTO> {
  // 1. Server-side authentication
  const actor = await requireAuth();

  // 2. Validate input
  const validation = validate(voidAttachmentSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const input = validation.data;

  // 3. Pre-fetch candidate attachment to identify parent target
  const candidate = await prisma.attachment.findUnique({
    where: { id: input.attachmentId },
    select: {
      id: true,
      projectId: true,
      ownerType: true,
      ownerId: true,
      uploadedById: true,
    },
  });

  if (!candidate) {
    throw new AppError('NOT_FOUND', 'المرفق غير موجود');
  }

  // 4. Atomic transaction: lock parent -> lock attachment -> validate -> void -> audit log
  const now = new Date();
  const voidedRow = await prisma.$transaction(async (tx) => {
    // 4.1 Lock parent record and verify actor can mutate draft attachments on this parent
    await resolveAndAuthorizeOwnerAccess({
      tx,
      actor,
      projectId: candidate.projectId,
      ownerType: candidate.ownerType,
      ownerId: candidate.ownerId,
      intent: 'MUTATE_DRAFT',
      lockParentRow: true,
    });

    // 4.2 Lock attachment row
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`
        SELECT id FROM attachments WHERE id = ${candidate.id} FOR UPDATE
      `;
    }

    const lockedAttachment = await tx.attachment.findUnique({
      where: { id: candidate.id },
    });

    if (!lockedAttachment) {
      throw new AppError('NOT_FOUND', 'المرفق غير موجود');
    }

    if (lockedAttachment.uploadedById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك إلغاء مرفق قام برفعه مستخدم آخر');
    }

    if (lockedAttachment.voidedAt !== null) {
      throw new AppError('ATTACHMENT_ALREADY_VOIDED', 'تم إلغاء هذا المرفق مسبقاً');
    }

    // 4.3 Update void fields (never hard-delete attachment metadata)
    const updated = await tx.attachment.update({
      where: { id: lockedAttachment.id },
      data: {
        voidedAt: now,
        voidedById: actor.id,
        voidReason: input.reason,
      },
      include: ATTACHMENT_INCLUDE,
    });

    // 4.4 Write append-only AuditLog in the SAME transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'ATTACHMENT_VOIDED',
        entityType: 'ATTACHMENT',
        entityId: updated.id,
        metadata: {
          projectId: updated.projectId,
          ownerType: updated.ownerType,
          ownerId: updated.ownerId,
          originalFileName: updated.originalFileName,
          voidReason: input.reason,
        },
      },
    });

    return updated;
  });

  return toAttachmentSummaryDTO(voidedRow as unknown as AttachmentQueryRow);
}


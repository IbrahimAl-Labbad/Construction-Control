/**
 * lib/attachments/queries/get-attachment-content.ts
 *
 * Query / Retrieval Service: Safely retrieves an attachment's metadata,
 * verified binary content, and hardened HTTP download headers by attachment ID.
 *
 * Enforces (AGENTS.md §12, §18; Addendum §9):
 * 1. Server-side authentication via `requireAuth()`.
 * 2. Strict ID validation (never accepts raw storage keys from callers).
 * 3. Verifies object-level and project-level access to the parent record via
 *    `resolveAndAuthorizeOwnerAccess` (`intent: 'VIEW'`). Prevents IDOR.
 * 4. Rejects retrieval of voided attachments unless `allowVoidedHistory === true`
 *    (restricted to Managers or the original uploader for audit inspection).
 * 5. Retrieves bytes from `AttachmentStorageProvider` and verifies that the
 *    stored bytes match `sizeBytes` and `checksumSha256` before returning.
 * 6. Produces safe download headers (`Content-Disposition: attachment`,
 *    `X-Content-Type-Options: nosniff`, sandboxed CSP) using the verified MIME type.
 */

import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  attachmentIdSchema,
  type AllowedAttachmentMimeType,
} from '@/lib/validation/schemas/attachment';
import { buildSafeDownloadHeaders } from '../file-validation';
import { ATTACHMENT_INCLUDE, toAttachmentSummaryDTO, type AttachmentQueryRow } from '../mappers';
import { resolveAndAuthorizeOwnerAccess } from '../owner-access';
import { getAttachmentStorageProvider } from '../storage';
import type { RetrievedAttachmentContent } from '../types';

export async function getAttachmentContent(
  attachmentIdInput: unknown,
  options?: { allowVoidedHistory?: boolean },
): Promise<RetrievedAttachmentContent> {
  // 1. Authentication
  const actor = await requireAuth();

  // 2. Validate attachmentId
  const idValidation = validate(attachmentIdSchema, attachmentIdInput);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const attachmentId = idValidation.data;

  // 3. Load attachment row
  const row = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: ATTACHMENT_INCLUDE,
  });

  if (!row) {
    throw new AppError('NOT_FOUND', 'المرفق غير موجود');
  }

  // 4. Verify object-level and project-level authorization on the parent record
  await resolveAndAuthorizeOwnerAccess({
    tx: prisma,
    actor,
    projectId: row.projectId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    intent: 'VIEW',
    lockParentRow: false,
  });

  // 5. Block voided attachments by default unless explicitly permitted for history inspection
  if (row.voidedAt !== null) {
    const canInspectVoided =
      options?.allowVoidedHistory === true &&
      (actor.role === Role.MANAGER || row.uploadedById === actor.id);

    if (!canInspectVoided) {
      throw new AppError('NOT_FOUND', 'هذا المرفق ملغي وغير متاح للتحميل');
    }
  }

  // 6. Retrieve bytes from storage provider and verify end-to-end integrity
  const storage = getAttachmentStorageProvider();
  const stored = await storage.getObjectBytes(row.storageKey);

  if (
    stored.sizeBytes !== row.sizeBytes ||
    stored.checksumSha256 !== row.checksumSha256
  ) {
    throw new AppError(
      'ATTACHMENT_INTEGRITY_ERROR',
      'فشل التحقق من البصمة الرقمية (SHA-256) لملف المرفق المخزن',
    );
  }

  const dto = toAttachmentSummaryDTO(row as unknown as AttachmentQueryRow);
  const headers = buildSafeDownloadHeaders({
    mimeType: dto.mimeType,
    originalFileName: dto.originalFileName,
    sizeBytes: dto.sizeBytes,
    checksumSha256: dto.checksumSha256,
  });

  return {
    attachment: dto,
    bytes: stored.bytes,
    contentType: dto.mimeType as AllowedAttachmentMimeType,
    contentLength: dto.sizeBytes,
    checksumSha256: dto.checksumSha256,
    headers,
  };
}


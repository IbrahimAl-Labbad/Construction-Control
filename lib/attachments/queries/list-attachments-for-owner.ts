/**
 * lib/attachments/queries/list-attachments-for-owner.ts
 *
 * Query: Lists attachments for a specific parent entity `(projectId, ownerType, ownerId)`.
 *
 * Enforces:
 * 1. Server-side authentication via `requireAuth()`.
 * 2. Strict Zod validation of input parameters.
 * 3. Object-level and project-level authorization via `resolveAndAuthorizeOwnerAccess`
 *    (`intent: 'VIEW'`).
 * 4. By default excludes voided attachments (`voidedAt === null`), unless
 *    `includeVoided === true` is explicitly requested.
 * 5. Returns client-safe `AttachmentSummaryDTO[]` (never exposes `storageKey`).
 */

import { prisma } from '@/lib/db/prisma';
import { ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { listAttachmentsForOwnerSchema } from '@/lib/validation/schemas/attachment';
import { ATTACHMENT_INCLUDE, toAttachmentSummaryDTO, type AttachmentQueryRow } from '../mappers';
import { resolveAndAuthorizeOwnerAccess } from '../owner-access';
import type { AttachmentSummaryDTO } from '../types';

export async function listAttachmentsForOwner(
  rawInput: unknown,
): Promise<AttachmentSummaryDTO[]> {
  const actor = await requireAuth();

  const validation = validate(listAttachmentsForOwnerSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const input = validation.data;

  // Verify caller has read access to the target parent record & project
  await resolveAndAuthorizeOwnerAccess({
    tx: prisma,
    actor,
    projectId: input.projectId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    intent: 'VIEW',
    lockParentRow: false,
  });

  const rows = await prisma.attachment.findMany({
    where: {
      projectId: input.projectId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      ...(input.includeVoided ? {} : { voidedAt: null }),
    },
    include: ATTACHMENT_INCLUDE,
    orderBy: {
      createdAt: 'desc',
    },
  });

  return rows.map((row) => toAttachmentSummaryDTO(row as unknown as AttachmentQueryRow));
}


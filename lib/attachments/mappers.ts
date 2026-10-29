/**
 * lib/attachments/mappers.ts
 *
 * Maps Prisma Attachment rows to client-safe DTOs.
 *
 * SECURITY RULE (AGENTS.md §12, §26):
 * - Strictly omits `storageKey` so raw storage keys and paths are never leaked.
 * - Converts Date instances to ISO strings.
 */

import type { AttachmentCategory, AttachmentOwnerType } from '@prisma/client';
import type { AllowedAttachmentMimeType } from '@/lib/validation/schemas/attachment';
import type { AttachmentSummaryDTO } from './types';

export const ATTACHMENT_INCLUDE = {
  uploadedBy: {
    select: {
      id: true,
      name: true,
    },
  },
  voidedBy: {
    select: {
      id: true,
      name: true,
    },
  },
  supersededBy: {
    select: {
      id: true,
    },
  },
} as const;

export type AttachmentQueryRow = {
  id: string;
  projectId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  category: AttachmentCategory;
  originalFileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedById: string;
  uploadedBy: { id: string; name: string };
  supersedesId: string | null;
  supersededBy?: { id: string } | null;
  voidedAt: Date | null;
  voidedById: string | null;
  voidedBy?: { id: string; name: string } | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toAttachmentSummaryDTO(row: AttachmentQueryRow): AttachmentSummaryDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    category: row.category,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType as AllowedAttachmentMimeType,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    uploadedById: row.uploadedById,
    uploadedByName: row.uploadedBy.name,
    supersedesId: row.supersedesId,
    supersededById: row.supersededBy?.id ?? null,
    isVoided: row.voidedAt !== null,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    voidedById: row.voidedById,
    voidedByName: row.voidedBy?.name ?? null,
    voidReason: row.voidReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}


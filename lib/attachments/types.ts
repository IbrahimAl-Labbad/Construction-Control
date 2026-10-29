/**
 * lib/attachments/types.ts
 *
 * Client-safe DTOs and domain types for Attachment Infrastructure — Wave 0.
 *
 * SECURITY RULE (AGENTS.md §12, §26):
 * - No Prisma model types, Decimal instances, or Date instances.
 * - `storageKey` is strictly excluded from client-facing DTOs so raw storage
 *   identifiers and internal paths are never exposed outside the server.
 * - Retrieval always passes through an authorization-aware server boundary
 *   by attachment `id`.
 */

import type { AttachmentCategory, AttachmentOwnerType } from '@prisma/client';
import type { AllowedAttachmentMimeType } from '@/lib/validation/schemas/attachment';

export type DerivedAttachmentLifecycleState =
  | 'EDITABLE_DRAFT'
  | 'LOCKED_IN_REVIEW'
  | 'UNLOCKED_REJECTED'
  | 'IMMUTABLE_ARCHIVE'
  | 'READ_ONLY_TERMINAL';

export type AttachmentSummaryDTO = {
  id: string;
  projectId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  category: AttachmentCategory;
  originalFileName: string;
  mimeType: AllowedAttachmentMimeType;
  sizeBytes: number;
  checksumSha256: string;
  uploadedById: string;
  uploadedByName: string;
  supersedesId: string | null;
  supersededById: string | null;
  isVoided: boolean;
  voidedAt: string | null;
  voidedById: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UploadAttachmentInput = {
  projectId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  category?: AttachmentCategory;
  originalFileName: string;
  declaredMimeType?: string;
  content: Uint8Array | Buffer;
  supersedesId?: string;
  replacementReason?: string;
};

export type RetrievedAttachmentContent = {
  attachment: AttachmentSummaryDTO;
  bytes: Buffer;
  contentType: AllowedAttachmentMimeType;
  contentLength: number;
  checksumSha256: string;
  headers: Record<string, string>;
};


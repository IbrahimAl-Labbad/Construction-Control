/**
 * lib/attachments/index.ts
 *
 * Public entrypoint for Attachment Infrastructure — Wave 0.
 *
 * Exposes:
 * - File validation, magic-byte inspection, filename normalization, checksums, and safe headers
 * - Backend-neutral storage abstraction and test/dev providers
 * - Polymorphic parent-entity authorization and derived lifecycle helper
 * - Server use cases (`uploadAttachment`, `voidAttachment`)
 * - Server queries (`listAttachmentsForOwner`, `getAttachmentContent`)
 * - Client-safe DTOs and mappers
 *
 * Follows AGENTS.md §8, §12, §18, §21, §26.
 */

export {
  detectMagicByteMimeType,
  normalizeAndValidateFileName,
  computeSha256Hex,
  generateOpaqueStorageKey,
  isValidOpaqueStorageKey,
  validateAttachmentFile,
  buildSafeDownloadHeaders,
  type NormalizedFilenameResult,
  type ValidatedAttachmentFile,
} from './file-validation';

export {
  assertSafeStorageKey,
  InMemoryAttachmentStorageProvider,
  LocalPrivateStorageProvider,
  UnconfiguredStorageProvider,
  getAttachmentStorageProvider,
  resolveAttachmentStorageProvider,
  setAttachmentStorageProvider,
  getDefaultMemoryStorageProvider,
  type AttachmentStorageProvider,
  type PutAttachmentObjectInput,
  type PutAttachmentObjectResult,
  type StoredAttachmentObject,
  type StorageResolutionOptions,
  type InMemoryStorageOptions,
  type LocalPrivateStorageOptions,
} from './storage';

export {
  deriveAttachmentLifecycleState,
  resolveAndAuthorizeOwnerAccess,
  type ResolvedAttachmentOwner,
} from './owner-access';

export { uploadAttachment } from './use-cases/upload-attachment';
export { voidAttachment } from './use-cases/void-attachment';

export { listAttachmentsForOwner } from './queries/list-attachments-for-owner';
export { getAttachmentContent } from './queries/get-attachment-content';

export {
  ATTACHMENT_INCLUDE,
  toAttachmentSummaryDTO,
  type AttachmentQueryRow,
} from './mappers';

export type {
  DerivedAttachmentLifecycleState,
  AttachmentSummaryDTO,
  UploadAttachmentInput,
  RetrievedAttachmentContent,
} from './types';


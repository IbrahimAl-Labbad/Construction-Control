/**
 * lib/attachments/file-validation.ts
 *
 * Pure server-side file validation, magic-byte inspection, filename normalization,
 * SHA-256 checksum calculation, opaque storage-key generation, and safe download
 * header construction for Attachment Infrastructure — Wave 0.
 *
 * Enforces target file policy:
 * - Allowed formats: JPEG (`image/jpeg`), PNG (`image/png`), WebP (`image/webp`), PDF (`application/pdf`).
 * - Maximum size: 10 MiB (`10_485_760` bytes); empty (`0` bytes) rejected.
 * - Magic-byte verification on actual file bytes (never trusts client MIME or extension alone).
 * - Rejects extension/signature mismatches and declared-MIME/signature mismatches.
 * - Normalizes and validates display filenames (rejects path traversal, control chars, hidden files).
 * - Generates opaque, non-guessable storage keys (`att_<256-bit random hex>`) independent of user input.
 * - Calculates SHA-256 hex digest server-side.
 *
 * SECURITY NOTE:
 * Magic-byte verification validates file header signatures only; it is NOT a full
 * antivirus or malware scanner.
 */

import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '@/lib/errors';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  type AllowedAttachmentMimeType,
} from '@/lib/validation/schemas/attachment';

const EXTENSION_TO_MIME: Record<string, AllowedAttachmentMimeType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const MIME_TO_CANONICAL_EXTENSION: Record<AllowedAttachmentMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const OPAQUE_STORAGE_KEY_REGEX = /^att_[0-9a-f]{64}$/;

/**
 * Inspects the leading magic bytes of a file buffer to determine its actual format.
 * Returns the verified MIME type or null if the signature does not match an allowed format.
 *
 * Signatures checked:
 * - JPEG: `FF D8 FF` (minimum 4 bytes)
 * - PNG: `89 50 4E 47 0D 0A 1A 0A` (minimum 8 bytes)
 * - WebP: `52 49 46 46` ("RIFF") at 0..3 and `57 45 42 50` ("WEBP") at 8..11 (minimum 12 bytes)
 * - PDF: `25 50 44 46 2D` ("%PDF-") at 0..4 (minimum 5 bytes)
 */
export function detectMagicByteMimeType(bytes: Uint8Array): AllowedAttachmentMimeType | null {
  if (bytes.byteLength < 4) {
    return null;
  }

  // 1. JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // 3. WebP: "RIFF" .... "WEBP"
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // 4. PDF: "%PDF-" (25 50 44 46 2D)
  if (
    bytes.byteLength >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf';
  }

  return null;
}

export type NormalizedFilenameResult = {
  normalizedFileName: string;
  extension: string | null;
};

/**
 * Normalizes and validates an untrusted original filename for metadata display.
 *
 * Security rules:
 * - Rejects null bytes, ASCII control characters (0x00–0x1F, 0x7F), and Unicode bidi overrides.
 * - Rejects path separators (`/`, `\`), drive prefixes (`C:`), and `..` traversal segments.
 * - Normalizes Unicode to NFC and collapses whitespace.
 * - Rejects empty names, dot-only names (`.`, `..`), or names exceeding 255 characters.
 * - Extracts the lowercase file extension if present.
 */
function hasControlOrBidiCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (
      code <= 0x1f ||
      code === 0x7f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    ) {
      return true;
    }
  }
  return false;
}

export function normalizeAndValidateFileName(rawFileName: string): NormalizedFilenameResult {
  if (typeof rawFileName !== 'string') {
    throw new AppError('ATTACHMENT_FILENAME_INVALID', 'اسم الملف غير صالح');
  }

  // Reject null bytes, control chars, and bidirectional override characters
  if (hasControlOrBidiCharacters(rawFileName)) {
    throw new AppError(
      'ATTACHMENT_FILENAME_INVALID',
      'اسم الملف يحتوي على محارف تحكم غير مسموح بها',
    );
  }

  // Reject path separators or Windows drive-letter prefixes
  if (rawFileName.includes('/') || rawFileName.includes('\\') || /^[a-zA-Z]:/.test(rawFileName)) {
    throw new AppError(
      'ATTACHMENT_FILENAME_INVALID',
      'اسم الملف لا يجب أن يتضمن مسارات أو فواصل مجلدات',
    );
  }

  const normalized = rawFileName.normalize('NFC').replace(/\s+/g, ' ').trim();

  if (
    normalized.length === 0 ||
    normalized.length > 255 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('..') ||
    normalized.startsWith('.')
  ) {
    throw new AppError('ATTACHMENT_FILENAME_INVALID', 'اسم الملف غير صالح');
  }

  // Disallow dangerous shell/HTML characters in display filenames
  if (/[<>:"|?*]/.test(normalized)) {
    throw new AppError(
      'ATTACHMENT_FILENAME_INVALID',
      'اسم الملف يحتوي على رموز غير مسموح بها',
    );
  }

  const lastDotIndex = normalized.lastIndexOf('.');
  let extension: string | null = null;
  if (lastDotIndex > 0 && lastDotIndex < normalized.length - 1) {
    extension = normalized.slice(lastDotIndex).toLowerCase();
  }

  return {
    normalizedFileName: normalized,
    extension,
  };
}

/**
 * Computes the lowercase hex SHA-256 checksum of a file buffer.
 */
export function computeSha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Generates an opaque, non-guessable storage key with 256 bits of cryptographic randomness.
 * Format: `att_<64 lowercase hex chars>`. Never includes user input or file extensions.
 */
export function generateOpaqueStorageKey(): string {
  return `att_${randomBytes(32).toString('hex')}`;
}

/**
 * Validates that a storage key matches the strict opaque server-generated format.
 * Prevents path traversal or storage key manipulation on retrieval/deletion.
 */
export function isValidOpaqueStorageKey(storageKey: string): boolean {
  return typeof storageKey === 'string' && OPAQUE_STORAGE_KEY_REGEX.test(storageKey);
}

export type ValidatedAttachmentFile = {
  normalizedFileName: string;
  verifiedMimeType: AllowedAttachmentMimeType;
  sizeBytes: number;
  checksumSha256: string;
  bytes: Buffer;
};

/**
 * Performs comprehensive server-side validation of an uploaded file buffer,
 * filename, extension, and optional client-declared MIME type.
 */
export function validateAttachmentFile(params: {
  originalFileName: string;
  declaredMimeType?: string | undefined;
  content: Uint8Array | Buffer;
}): ValidatedAttachmentFile {
  const { originalFileName, declaredMimeType, content } = params;

  if (
    !content ||
    (!Buffer.isBuffer(content) &&
      !(content instanceof Uint8Array) &&
      !ArrayBuffer.isView(content))
  ) {
    throw new AppError('ATTACHMENT_EMPTY_FILE', 'محتوى الملف غير صالح أو فارغ');
  }

  const sizeBytes = content.byteLength;
  if (sizeBytes === 0) {
    throw new AppError('ATTACHMENT_EMPTY_FILE', 'لا يمكن رفع ملف فارغ (0 بايت)');
  }

  if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new AppError(
      'ATTACHMENT_FILE_TOO_LARGE',
      `حجم الملف يتجاوز الحد الأقصى المسموح به (10 ميجابايت / ${MAX_ATTACHMENT_SIZE_BYTES} بايت)`,
    );
  }

  // 1. Validate and normalize display filename
  const { normalizedFileName, extension } = normalizeAndValidateFileName(originalFileName);

  // 2. If declaredMimeType is provided, check it against the allowlist first
  let normalizedDeclaredMime: AllowedAttachmentMimeType | undefined;
  if (declaredMimeType !== undefined && declaredMimeType.trim() !== '') {
    const candidate = declaredMimeType.trim().toLowerCase().split(';')[0]?.trim() ?? '';
    if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(candidate)) {
      throw new AppError(
        'ATTACHMENT_UNSUPPORTED_MIME',
        `نوع الملف المعلن غير مدعوم (${candidate}). الأنواع المسموحة: JPEG, PNG, WebP, PDF`,
      );
    }
    normalizedDeclaredMime = candidate as AllowedAttachmentMimeType;
  }

  // 3. If filename includes an extension, verify extension is in allowlist
  let expectedMimeFromExt: AllowedAttachmentMimeType | undefined;
  if (extension !== null) {
    const mapped = EXTENSION_TO_MIME[extension];
    if (!mapped) {
      throw new AppError(
        'ATTACHMENT_EXTENSION_MISMATCH',
        `امتداد الملف (${extension}) غير مدعوم. الامتدادات المسموحة: .jpg, .jpeg, .png, .webp, .pdf`,
      );
    }
    expectedMimeFromExt = mapped;
  }

  // 4. Verify magic bytes from actual content
  const verifiedMimeType = detectMagicByteMimeType(content);
  if (!verifiedMimeType) {
    throw new AppError(
      'ATTACHMENT_UNSUPPORTED_MIME',
      'توقيع الملف الفعلي (Magic Bytes) غير صالح أو غير مدعوم. يُسمح فقط بملفات JPEG وPNG وWebP وPDF الحقيقية',
    );
  }

  // 5. Reject spoofed/mismatched declared MIME vs magic-byte signature
  if (normalizedDeclaredMime && normalizedDeclaredMime !== verifiedMimeType) {
    throw new AppError(
      'ATTACHMENT_SIGNATURE_MISMATCH',
      `نوع الملف المعلن (${normalizedDeclaredMime}) لا يطابق المحتوى الفعلي للملف (${verifiedMimeType})`,
    );
  }

  // 6. Reject mismatched filename extension vs magic-byte signature
  if (expectedMimeFromExt && expectedMimeFromExt !== verifiedMimeType) {
    throw new AppError(
      'ATTACHMENT_EXTENSION_MISMATCH',
      `امتداد الملف (${extension}) لا يطابق المحتوى الفعلي للملف (${verifiedMimeType})`,
    );
  }

  // Ensure canonical extension if filename had no extension
  const finalFileName =
    extension === null
      ? `${normalizedFileName}${MIME_TO_CANONICAL_EXTENSION[verifiedMimeType]}`
      : normalizedFileName;

  const checksumSha256 = computeSha256Hex(content);
  const bytes = Buffer.isBuffer(content) ? Buffer.from(content) : Buffer.from(content);

  return {
    normalizedFileName: finalFileName,
    verifiedMimeType,
    sizeBytes,
    checksumSha256,
    bytes,
  };
}

/**
 * Builds hardened HTTP headers for serving attachment bytes safely.
 * Prevents MIME sniffing, inline script/HTML execution, and framing.
 */
export function buildSafeDownloadHeaders(params: {
  mimeType: AllowedAttachmentMimeType;
  originalFileName: string;
  sizeBytes: number;
  checksumSha256: string;
}): Record<string, string> {
  const { mimeType, originalFileName, sizeBytes, checksumSha256 } = params;
  const asciiFallback = originalFileName
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encodedUtf8 = encodeURIComponent(originalFileName);

  return {
    'Content-Type': mimeType,
    'Content-Length': String(sizeBytes),
    'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
    'X-Checksum-Sha256': checksumSha256,
  };
}

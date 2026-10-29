/**
 * tests/unit/lib/attachment-validation-and-storage.test.ts
 *
 * Unit tests for Attachment Infrastructure — Wave 0:
 * 1. Magic-byte detection for JPEG, PNG, WebP, and PDF.
 * 2. Rejection of unsupported/malformed file contents (HTML, EXE, ZIP, GIF, truncated headers).
 * 3. Rejection of extension/MIME/signature mismatches (e.g., PNG bytes named `.jpg`, PDF declared as `image/png`).
 * 4. Empty files (0 bytes), exact 10 MiB boundary (10,485,760 bytes), and 1 byte over limit (10,485,761 bytes).
 * 5. Filename normalization and rejection of path traversal (`../`, `\`, `C:`), control chars, bidi overrides, and dot-files.
 * 6. Opaque storage-key generation, uniqueness, and path-isolation validation.
 * 7. SHA-256 server-side checksum calculation and safe download header generation.
 * 8. Storage provider behavior (`InMemoryAttachmentStorageProvider`, `LocalPrivateStorageProvider`, `UnconfiguredStorageProvider`),
 *    including path-traversal protection, `public/` directory guard, and production environment gating.
 * 9. Derived attachment lifecycle state mapping from parent status.
 * 10. Zod metadata validation schemas and attachment policies.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { Role } from '@prisma/client';
import {
  buildSafeDownloadHeaders,
  computeSha256Hex,
  deriveAttachmentLifecycleState,
  detectMagicByteMimeType,
  generateOpaqueStorageKey,
  InMemoryAttachmentStorageProvider,
  isValidOpaqueStorageKey,
  LocalPrivateStorageProvider,
  normalizeAndValidateFileName,
  resolveAttachmentStorageProvider,
  setAttachmentStorageProvider,
  UnconfiguredStorageProvider,
  validateAttachmentFile,
} from '@/lib/attachments';
import { validateEnvConfig } from '@/lib/config/env';
import { AppError } from '@/lib/errors';
import { policies } from '@/lib/permissions/policies';
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  uploadAttachmentMetadataSchema,
  voidAttachmentSchema,
} from '@/lib/validation/schemas/attachment';

// Sample valid magic-byte payloads
const SAMPLE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const SAMPLE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const SAMPLE_WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);
const SAMPLE_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'ascii');

describe('Attachment Infrastructure — Wave 0: File Validation & Magic Bytes', () => {
  it('detects valid JPEG, PNG, WebP, and PDF magic-byte signatures', () => {
    expect(detectMagicByteMimeType(SAMPLE_JPEG)).toBe('image/jpeg');
    expect(detectMagicByteMimeType(SAMPLE_PNG)).toBe('image/png');
    expect(detectMagicByteMimeType(SAMPLE_WEBP)).toBe('image/webp');
    expect(detectMagicByteMimeType(SAMPLE_PDF)).toBe('application/pdf');
  });

  it('rejects unsupported, truncated, or malformed file signatures', () => {
    // Too short (< 4 bytes)
    expect(detectMagicByteMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
    // HTML / script payload
    expect(detectMagicByteMimeType(Buffer.from('<!DOCTYPE html><script>alert(1)</script>'))).toBeNull();
    // Windows PE / EXE ("MZ")
    expect(detectMagicByteMimeType(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]))).toBeNull();
    // ZIP / DOCX ("PK\x03\x04")
    expect(detectMagicByteMimeType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBeNull();
    // GIF ("GIF89a")
    expect(detectMagicByteMimeType(Buffer.from('GIF89a\x01\x00\x01\x00', 'ascii'))).toBeNull();
    // RIFF WAVE audio (not WEBP at bytes 8..11)
    expect(
      detectMagicByteMimeType(
        Buffer.from([
          0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
        ]),
      ),
    ).toBeNull();
  });

  it('validates matching JPEG, PNG, WebP, and PDF files and computes SHA-256 checksums', () => {
    const jpegRes = validateAttachmentFile({
      originalFileName: 'صورة-الموقع.JPG',
      declaredMimeType: 'image/jpeg',
      content: SAMPLE_JPEG,
    });
    expect(jpegRes.verifiedMimeType).toBe('image/jpeg');
    expect(jpegRes.sizeBytes).toBe(SAMPLE_JPEG.byteLength);
    expect(jpegRes.checksumSha256).toBe(computeSha256Hex(SAMPLE_JPEG));
    expect(jpegRes.checksumSha256).toMatch(/^[0-9a-f]{64}$/);

    const pngRes = validateAttachmentFile({
      originalFileName: 'receipt.png',
      declaredMimeType: 'image/png',
      content: SAMPLE_PNG,
    });
    expect(pngRes.verifiedMimeType).toBe('image/png');

    const webpRes = validateAttachmentFile({
      originalFileName: 'progress_photo.webp',
      declaredMimeType: 'image/webp',
      content: SAMPLE_WEBP,
    });
    expect(webpRes.verifiedMimeType).toBe('image/webp');

    const pdfRes = validateAttachmentFile({
      originalFileName: 'delivery-note',
      content: SAMPLE_PDF,
    });
    expect(pdfRes.verifiedMimeType).toBe('application/pdf');
    // Appends canonical extension when none was provided
    expect(pdfRes.normalizedFileName).toBe('delivery-note.pdf');
  });

  it('rejects extension/MIME/signature mismatches and spoofed content types', () => {
    // PNG bytes with .pdf extension
    expect(() =>
      validateAttachmentFile({
        originalFileName: 'spoofed.pdf',
        declaredMimeType: 'image/png',
        content: SAMPLE_PNG,
      }),
    ).toThrowError(expect.objectContaining({ code: 'ATTACHMENT_EXTENSION_MISMATCH' }));

    // JPEG bytes with declared image/png MIME
    expect(() =>
      validateAttachmentFile({
        originalFileName: 'photo.jpg',
        declaredMimeType: 'image/png',
        content: SAMPLE_JPEG,
      }),
    ).toThrowError(expect.objectContaining({ code: 'ATTACHMENT_SIGNATURE_MISMATCH' }));

    // Disallowed extension (.exe) even with valid PDF bytes
    expect(() =>
      validateAttachmentFile({
        originalFileName: 'payload.exe',
        content: SAMPLE_PDF,
      }),
    ).toThrowError(expect.objectContaining({ code: 'ATTACHMENT_EXTENSION_MISMATCH' }));

    // Disallowed declared MIME (text/html)
    expect(() =>
      validateAttachmentFile({
        originalFileName: 'doc.pdf',
        declaredMimeType: 'text/html',
        content: SAMPLE_PDF,
      }),
    ).toThrowError(expect.objectContaining({ code: 'ATTACHMENT_UNSUPPORTED_MIME' }));

    // HTML bytes disguised as .pdf and application/pdf
    expect(() =>
      validateAttachmentFile({
        originalFileName: 'invoice.pdf',
        declaredMimeType: 'application/pdf',
        content: Buffer.from('<html><body>fake pdf</body></html>', 'utf8'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'ATTACHMENT_UNSUPPORTED_MIME' }));
  });

  it('enforces exact file size boundaries: rejects 0 bytes, accepts 10 MiB, rejects 10 MiB + 1 byte', () => {
    // 0 bytes -> rejected
    expect(() =>
      validateAttachmentFile({
        originalFileName: 'empty.pdf',
        content: Buffer.alloc(0),
      }),
    ).toThrowError(expect.objectContaining({ code: 'ATTACHMENT_EMPTY_FILE' }));

    // Exact 10 MiB boundary (10,485,760 bytes) with valid PDF header -> accepted
    const exactLimitBuffer = Buffer.alloc(MAX_ATTACHMENT_SIZE_BYTES, 0x20);
    SAMPLE_PDF.copy(exactLimitBuffer, 0);

    const exactResult = validateAttachmentFile({
      originalFileName: 'boundary-10mib.pdf',
      declaredMimeType: 'application/pdf',
      content: exactLimitBuffer,
    });
    expect(exactResult.sizeBytes).toBe(MAX_ATTACHMENT_SIZE_BYTES);
    expect(exactResult.verifiedMimeType).toBe('application/pdf');

    // 1 byte above 10 MiB (10,485,761 bytes) -> rejected with 413 ATTACHMENT_FILE_TOO_LARGE
    const overLimitBuffer = Buffer.alloc(MAX_ATTACHMENT_SIZE_BYTES + 1, 0x20);
    SAMPLE_PDF.copy(overLimitBuffer, 0);

    try {
      validateAttachmentFile({
        originalFileName: 'oversized.pdf',
        declaredMimeType: 'application/pdf',
        content: overLimitBuffer,
      });
      expect.fail('Expected oversized file to throw ATTACHMENT_FILE_TOO_LARGE');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ATTACHMENT_FILE_TOO_LARGE');
      expect((err as AppError).httpStatus).toBe(413);
    }
  });

  it('rejects filenames containing traversal attempts, slashes, control chars, or forbidden symbols', () => {
    const invalidNames = [
      '',
      '   ',
      '.',
      '..',
      '.env',
      '../secret.pdf',
      '..\\secret.pdf',
      'folder/photo.jpg',
      'folder\\photo.jpg',
      'C:photo.jpg',
      'file..name.pdf',
      'null\u0000byte.pdf',
      'newline\nfile.pdf',
      'bidi\u202Efdp.exe.pdf',
      'bad<script>.pdf',
      'pipe|name.pdf',
      `${'a'.repeat(252)}.pdf`, // > 255 chars
    ];

    for (const badName of invalidNames) {
      expect(() => normalizeAndValidateFileName(badName)).toThrowError(
        expect.objectContaining({ code: 'ATTACHMENT_FILENAME_INVALID' }),
      );
    }

    const validArabic = normalizeAndValidateFileName('  مستخلص   أعمال الخرسانة - رقم 1.PDF  ');
    expect(validArabic.normalizedFileName).toBe('مستخلص أعمال الخرسانة - رقم 1.PDF');
    expect(validArabic.extension).toBe('.pdf');
  });

  it('generates unique opaque storage keys and builds hardened download headers', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const k = generateOpaqueStorageKey();
      expect(isValidOpaqueStorageKey(k)).toBe(true);
      expect(k).toMatch(/^att_[0-9a-f]{64}$/);
      keys.add(k);
    }
    expect(keys.size).toBe(200);

    // Rejects non-opaque / traversal keys
    expect(isValidOpaqueStorageKey('../att_' + 'a'.repeat(64))).toBe(false);
    expect(isValidOpaqueStorageKey('att_' + 'a'.repeat(63))).toBe(false);
    expect(isValidOpaqueStorageKey('att_' + 'A'.repeat(64))).toBe(false);
    expect(isValidOpaqueStorageKey('user_supplied_filename.pdf')).toBe(false);

    const headers = buildSafeDownloadHeaders({
      mimeType: 'application/pdf',
      originalFileName: 'تقرير الموقع.pdf',
      sizeBytes: 1024,
      checksumSha256: 'a'.repeat(64),
    });

    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Length']).toBe('1024');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(headers['Content-Disposition']).toContain('attachment;');
    expect(headers['Content-Disposition']).toContain(encodeURIComponent('تقرير الموقع.pdf'));
  });
});

describe('Attachment Infrastructure — Wave 0: Storage Providers & Isolation', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('InMemoryAttachmentStorageProvider stores, retrieves, verifies checksums, and deletes objects', async () => {
    const provider = new InMemoryAttachmentStorageProvider();
    const checksum = computeSha256Hex(SAMPLE_PNG);

    const putRes = await provider.putObject({
      bytes: SAMPLE_PNG,
      mimeType: 'image/png',
      sizeBytes: SAMPLE_PNG.byteLength,
      checksumSha256: checksum,
    });

    expect(isValidOpaqueStorageKey(putRes.storageKey)).toBe(true);
    expect(provider.hasKey(putRes.storageKey)).toBe(true);

    const fetched = await provider.getObjectBytes(putRes.storageKey);
    expect(fetched.bytes.equals(SAMPLE_PNG)).toBe(true);
    expect(fetched.checksumSha256).toBe(checksum);

    await provider.deleteObject(putRes.storageKey);
    expect(provider.hasKey(putRes.storageKey)).toBe(false);

    await expect(provider.getObjectBytes(putRes.storageKey)).rejects.toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('LocalPrivateStorageProvider stores files outside public/, blocks traversal keys, and blocks production use', async () => {
    // 1. Refuse configuration inside public/
    expect(
      () =>
        new LocalPrivateStorageProvider({
          rootDir: path.resolve(process.cwd(), 'public', 'uploads'),
          allowInCurrentEnv: true,
        }),
    ).toThrow(/must never be inside the public\/ directory/);

    // 2. Refuse operation when allowInCurrentEnv is false (production guard)
    const prodBlocked = new LocalPrivateStorageProvider({
      rootDir: path.join(os.tmpdir(), 'cc-prod-blocked'),
      allowInCurrentEnv: false,
    });
    const checksum = computeSha256Hex(SAMPLE_JPEG);
    await expect(
      prodBlocked.putObject({
        bytes: SAMPLE_JPEG,
        mimeType: 'image/jpeg',
        sizeBytes: SAMPLE_JPEG.byteLength,
        checksumSha256: checksum,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_STORAGE_UNAVAILABLE' }));

    // 3. Store, retrieve, and delete in an isolated private temp directory
    const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-att-test-'));
    tempDirs.push(privateDir);

    const localProvider = new LocalPrivateStorageProvider({
      rootDir: privateDir,
      allowInCurrentEnv: true,
    });

    const stored = await localProvider.putObject({
      bytes: SAMPLE_JPEG,
      mimeType: 'image/jpeg',
      sizeBytes: SAMPLE_JPEG.byteLength,
      checksumSha256: checksum,
    });

    const retrieved = await localProvider.getObjectBytes(stored.storageKey);
    expect(retrieved.bytes.equals(SAMPLE_JPEG)).toBe(true);
    expect(retrieved.checksumSha256).toBe(checksum);

    // Rejects manipulated storage key on getObjectBytes and deleteObject
    await expect(localProvider.getObjectBytes('../etc/passwd')).rejects.toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
    await expect(localProvider.deleteObject('..\\Windows\\win.ini')).rejects.toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );

    await localProvider.deleteObject(stored.storageKey);
    await expect(localProvider.getObjectBytes(stored.storageKey)).rejects.toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('UnconfiguredStorageProvider fails closed with ATTACHMENT_STORAGE_UNAVAILABLE', async () => {
    const unconfigured = new UnconfiguredStorageProvider();
    const health = await unconfigured.checkHealth();
    expect(health.available).toBe(false);

    await expect(
      unconfigured.putObject({
        bytes: SAMPLE_PDF,
        mimeType: 'application/pdf',
        sizeBytes: SAMPLE_PDF.byteLength,
        checksumSha256: computeSha256Hex(SAMPLE_PDF),
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_STORAGE_UNAVAILABLE' }));
  });

  it('derives lifecycle state accurately from parent status and validates Zod schemas & policies', () => {
    expect(deriveAttachmentLifecycleState('DRAFT')).toBe('EDITABLE_DRAFT');
    expect(deriveAttachmentLifecycleState('SUBMITTED')).toBe('LOCKED_IN_REVIEW');
    expect(deriveAttachmentLifecycleState('AUDITED')).toBe('LOCKED_IN_REVIEW');
    expect(deriveAttachmentLifecycleState('REJECTED')).toBe('UNLOCKED_REJECTED');
    expect(deriveAttachmentLifecycleState('APPROVED')).toBe('IMMUTABLE_ARCHIVE');
    expect(deriveAttachmentLifecycleState('CANCELLED')).toBe('READ_ONLY_TERMINAL');
    expect(deriveAttachmentLifecycleState('REVERSED')).toBe('READ_ONLY_TERMINAL');

    const validMeta = uploadAttachmentMetadataSchema.safeParse({
      projectId: 'proj_1',
      ownerType: 'EXPENSE',
      ownerId: 'exp_1',
      originalFileName: 'invoice.pdf',
    });
    expect(validMeta.success).toBe(true);

    const invalidVoid = voidAttachmentSchema.safeParse({
      attachmentId: 'att_1',
      reason: '  ',
    });
    expect(invalidVoid.success).toBe(false);

    const activeEngineer = {
      id: 'eng_1',
      name: 'Eng',
      email: 'eng@test.local',
      role: Role.ENGINEER,
      isActive: true,
    };
    expect(
      policies.canUploadAttachmentOnDraft(activeEngineer, {
        authorUserId: 'eng_1',
        parentStatus: 'DRAFT',
      }),
    ).toBe(true);
    expect(
      policies.canUploadAttachmentOnDraft(activeEngineer, {
        authorUserId: 'eng_1',
        parentStatus: 'SUBMITTED',
      }),
    ).toBe(false);
    expect(
      policies.canVoidOrReplaceAttachment(activeEngineer, {
        uploadedById: 'eng_1',
        parentStatus: 'DRAFT',
        isVoided: false,
      }),
    ).toBe(true);
    expect(
      policies.canVoidOrReplaceAttachment(activeEngineer, {
        uploadedById: 'eng_1',
        parentStatus: 'DRAFT',
        isVoided: true,
      }),
    ).toBe(false);
  });
});

describe('Attachment Infrastructure — Wave 0: Production Storage Fail-Closed Hardening', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  const baseValidEnv = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/db',
    NEXTAUTH_SECRET: 'a'.repeat(32),
    NEXTAUTH_URL: 'http://localhost:3000',
    LOG_LEVEL: 'info',
  };

  it('proves production mode rejects the memory provider via env validation, centralized resolution, and instance guard', async () => {
    // 1. Env schema rejection in production
    const envResult = validateEnvConfig({
      ...baseValidEnv,
      NODE_ENV: 'production',
      ATTACHMENT_STORAGE_PROVIDER: 'memory',
    });
    expect(envResult.success).toBe(false);
    if (!envResult.success) {
      expect(
        envResult.errors.some(
          (e) => e.includes('ATTACHMENT_STORAGE_PROVIDER') && e.includes('memory'),
        ),
      ).toBe(true);
    }

    // 2. Centralized resolver rejection in production
    expect(() =>
      resolveAttachmentStorageProvider({
        nodeEnv: 'production',
        configuredProvider: 'memory',
        allowTestOverride: false,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }),
    );

    // 3. Direct instance guard rejection in production
    const memBlocked = new InMemoryAttachmentStorageProvider({ allowInCurrentEnv: false });
    const health = await memBlocked.checkHealth();
    expect(health.available).toBe(false);
    await expect(
      memBlocked.putObject({
        bytes: SAMPLE_PDF,
        mimeType: 'application/pdf',
        sizeBytes: SAMPLE_PDF.byteLength,
        checksumSha256: computeSha256Hex(SAMPLE_PDF),
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_STORAGE_UNAVAILABLE' }));
    await expect(
      memBlocked.getObjectBytes('att_' + '1'.repeat(64)),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_STORAGE_UNAVAILABLE' }));
  });

  it('proves production mode rejects the local_dev provider via env validation, centralized resolution, and instance guard', async () => {
    // 1. Env schema rejection in production
    const envResult = validateEnvConfig({
      ...baseValidEnv,
      NODE_ENV: 'production',
      ATTACHMENT_STORAGE_PROVIDER: 'local_dev',
    });
    expect(envResult.success).toBe(false);
    if (!envResult.success) {
      expect(
        envResult.errors.some(
          (e) => e.includes('ATTACHMENT_STORAGE_PROVIDER') && e.includes('local_dev'),
        ),
      ).toBe(true);
    }

    // 2. Centralized resolver rejection in production
    expect(() =>
      resolveAttachmentStorageProvider({
        nodeEnv: 'production',
        configuredProvider: 'local_dev',
        allowTestOverride: false,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }),
    );

    // 3. Direct instance guard rejection in production
    const localBlocked = new LocalPrivateStorageProvider({
      rootDir: path.join(os.tmpdir(), 'cc-prod-local-blocked'),
      allowInCurrentEnv: false,
    });
    const health = await localBlocked.checkHealth();
    expect(health.available).toBe(false);
    await expect(
      localBlocked.putObject({
        bytes: SAMPLE_JPEG,
        mimeType: 'image/jpeg',
        sizeBytes: SAMPLE_JPEG.byteLength,
        checksumSha256: computeSha256Hex(SAMPLE_JPEG),
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'ATTACHMENT_STORAGE_UNAVAILABLE' }));
  });

  it('proves unconfigured production storage fails closed without exposing internal paths or secrets', async () => {
    // 1. Env validation succeeds when ATTACHMENT_STORAGE_PROVIDER is omitted or explicitly 'disabled' in production
    const envOmitted = validateEnvConfig({
      ...baseValidEnv,
      NODE_ENV: 'production',
    });
    expect(envOmitted.success).toBe(true);

    const envDisabled = validateEnvConfig({
      ...baseValidEnv,
      NODE_ENV: 'production',
      ATTACHMENT_STORAGE_PROVIDER: 'disabled',
    });
    expect(envDisabled.success).toBe(true);

    // 2. Centralized resolver returns UnconfiguredStorageProvider
    const provider = resolveAttachmentStorageProvider({
      nodeEnv: 'production',
      configuredProvider: undefined,
      allowTestOverride: false,
    });
    expect(provider.providerName).toBe('disabled');
    const health = await provider.checkHealth();
    expect(health.available).toBe(false);

    // 3. Put and get fail closed with ATTACHMENT_STORAGE_UNAVAILABLE
    await expect(
      provider.putObject({
        bytes: SAMPLE_PDF,
        mimeType: 'application/pdf',
        sizeBytes: SAMPLE_PDF.byteLength,
        checksumSha256: computeSha256Hex(SAMPLE_PDF),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }),
    );
    await expect(
      provider.getObjectBytes('att_' + '2'.repeat(64)),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }),
    );
  });

  it('proves permitted test and development modes continue to work', async () => {
    // 1. Env validation allows 'memory' and 'local_dev' in development
    const envDevMem = validateEnvConfig({
      ...baseValidEnv,
      NODE_ENV: 'development',
      ATTACHMENT_STORAGE_PROVIDER: 'memory',
    });
    expect(envDevMem.success).toBe(true);

    const envDevLocal = validateEnvConfig({
      ...baseValidEnv,
      NODE_ENV: 'development',
      ATTACHMENT_STORAGE_PROVIDER: 'local_dev',
    });
    expect(envDevLocal.success).toBe(true);

    // 2. Env validation allows 'memory' in test
    const envTestMem = validateEnvConfig({
      ...baseValidEnv,
      NODE_ENV: 'test',
      ATTACHMENT_STORAGE_PROVIDER: 'memory',
    });
    expect(envTestMem.success).toBe(true);

    // 3. Centralized resolver resolves memory provider in test
    const testProvider = resolveAttachmentStorageProvider({
      nodeEnv: 'test',
      configuredProvider: 'memory',
      allowTestOverride: false,
    });
    expect(testProvider.providerName).toBe('memory');

    // 4. Centralized resolver resolves local_dev provider in development
    const devLocalProvider = resolveAttachmentStorageProvider({
      nodeEnv: 'development',
      configuredProvider: 'local_dev',
      allowTestOverride: false,
    });
    expect(devLocalProvider.providerName).toBe('local_dev');

    // 5. Default test resolution (no configured provider) resolves in-memory provider
    const defaultTestProvider = resolveAttachmentStorageProvider({
      nodeEnv: 'test',
      configuredProvider: undefined,
      allowTestOverride: false,
    });
    expect(defaultTestProvider.providerName).toBe('memory');
  });

  it('rejects test overrides of memory or local_dev when running in production mode', () => {
    const memOverride = new InMemoryAttachmentStorageProvider({ allowInCurrentEnv: true });
    setAttachmentStorageProvider(memOverride);

    expect(() =>
      resolveAttachmentStorageProvider({
        nodeEnv: 'production',
        allowTestOverride: true,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }),
    );

    // Reset override
    setAttachmentStorageProvider(null);
  });

  it('unconditionally blocks InMemoryAttachmentStorageProvider in production even when allowInCurrentEnv: true or permissive options are supplied', async () => {
    // Attempt permissive instantiation simulating production
    const memPermissive = new InMemoryAttachmentStorageProvider({
      simulateProduction: true,
      allowInCurrentEnv: true, // Attempted bypass!
    });

    // 1. checkHealth reports unavailable
    const health = await memPermissive.checkHealth();
    expect(health.available).toBe(false);
    expect(health.reason).toContain('production');

    // 2. putObject throws ATTACHMENT_STORAGE_UNAVAILABLE
    await expect(
      memPermissive.putObject({
        bytes: SAMPLE_PDF,
        mimeType: 'application/pdf',
        sizeBytes: SAMPLE_PDF.byteLength,
        checksumSha256: computeSha256Hex(SAMPLE_PDF),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }),
    );

    // 3. getObjectBytes throws ATTACHMENT_STORAGE_UNAVAILABLE
    await expect(
      memPermissive.getObjectBytes('att_' + '9'.repeat(64)),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }),
    );
  });

  it('unconditionally blocks LocalPrivateStorageProvider in production even when allowInCurrentEnv: true or permissive options are supplied', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-prod-permissive-'));
    tempDirs.push(tempDir);

    // Attempt permissive instantiation simulating production
    const localPermissive = new LocalPrivateStorageProvider({
      rootDir: tempDir,
      simulateProduction: true,
      allowInCurrentEnv: true, // Attempted bypass!
    });

    // 1. checkHealth reports unavailable
    const health = await localPermissive.checkHealth();
    expect(health.available).toBe(false);
    expect(health.reason).toContain('production');

    // 2. putObject throws ATTACHMENT_STORAGE_UNAVAILABLE
    await expect(
      localPermissive.putObject({
        bytes: SAMPLE_PNG,
        mimeType: 'image/png',
        sizeBytes: SAMPLE_PNG.byteLength,
        checksumSha256: computeSha256Hex(SAMPLE_PNG),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }),
    );

    // 3. getObjectBytes throws ATTACHMENT_STORAGE_UNAVAILABLE
    await expect(
      localPermissive.getObjectBytes('att_' + '8'.repeat(64)),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }),
    );

    // 4. deleteObject throws ATTACHMENT_STORAGE_UNAVAILABLE
    await expect(
      localPermissive.deleteObject('att_' + '8'.repeat(64)),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
      }),
    );
  });
});


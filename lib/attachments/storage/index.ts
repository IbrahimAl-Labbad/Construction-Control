/**
 * lib/attachments/storage/index.ts
 *
 * Backend-neutral object storage abstraction for Attachment Infrastructure — Wave 0.
 *
 * ARCHITECTURAL & SECURITY RULES (AGENTS.md §12, Addendum §9):
 * - No cloud vendor is silently chosen or activated in Wave 0.
 * - Never stores binaries in PostgreSQL.
 * - Never stores files in `public/` or any publicly served directory.
 * - Prevents path traversal and storage-key manipulation by enforcing strict
 *   opaque server-generated keys (`att_<64 lowercase hex>`).
 * - Never exposes filesystem paths, storage credentials, or public URLs.
 * - `LocalPrivateStorageProvider` is strictly gated to non-production environments
 *   (`NODE_ENV !== 'production'`).
 * - Production storage defaults to `UnconfiguredStorageProvider` (`ATTACHMENT_STORAGE_UNAVAILABLE`)
 *   until the Owner explicitly selects and configures a production storage backend.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { env, isProduction } from '@/lib/config/env';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { AllowedAttachmentMimeType } from '@/lib/validation/schemas/attachment';
import {
  computeSha256Hex,
  generateOpaqueStorageKey,
  isValidOpaqueStorageKey,
} from '../file-validation';

export type PutAttachmentObjectInput = {
  bytes: Buffer;
  mimeType: AllowedAttachmentMimeType;
  sizeBytes: number;
  checksumSha256: string;
  storageKey?: string;
};

export type PutAttachmentObjectResult = {
  storageKey: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type StoredAttachmentObject = {
  bytes: Buffer;
  sizeBytes: number;
  checksumSha256: string;
};

/**
 * Backend-neutral storage provider contract.
 */
export interface AttachmentStorageProvider {
  readonly providerName: string;

  /**
   * Stores validated file bytes and returns the opaque storage key.
   */
  putObject(input: PutAttachmentObjectInput): Promise<PutAttachmentObjectResult>;

  /**
   * Retrieves file bytes by opaque storage key and verifies integrity.
   */
  getObjectBytes(storageKey: string): Promise<StoredAttachmentObject>;

  /**
   * Removes an unreferenced / orphaned object (e.g., when a database transaction fails)
   * or purges a never-submitted draft file when authorized.
   * Must be idempotent when the key does not exist.
   */
  deleteObject(storageKey: string): Promise<void>;

  /**
   * Checks whether the storage backend is reachable and operational.
   */
  checkHealth(): Promise<{ available: boolean; reason?: string }>;
}

/**
 * Validates that a storage key is strictly in the opaque `att_<64 hex>` format.
 * Throws `VALIDATION_ERROR` if manipulated or malformed.
 */
export function assertSafeStorageKey(storageKey: string): void {
  if (!isValidOpaqueStorageKey(storageKey)) {
    throw new AppError('VALIDATION_ERROR', 'مفتاح التخزين غير صالح');
  }
}

// ---------------------------------------------------------------------------
// 1. In-Memory Storage Provider (Unit & Integration Test Adapter)
// ---------------------------------------------------------------------------

type MemoryEntry = {
  bytes: Buffer;
  mimeType: AllowedAttachmentMimeType;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: Date;
};

export type InMemoryStorageOptions = {
  /**
   * Test-only option to simulate production mode.
   */
  simulateProduction?: boolean | undefined;
  /**
   * Deprecated test-only option. Passing true CANNOT bypass real or simulated production mode.
   */
  allowInCurrentEnv?: boolean | undefined;
};

export class InMemoryAttachmentStorageProvider implements AttachmentStorageProvider {
  public readonly providerName = 'memory';
  private readonly objects = new Map<string, MemoryEntry>();
  private readonly isBlockedInEnv: boolean;
  private healthy = true;

  constructor(options?: InMemoryStorageOptions) {
    // SECURITY HARDENING: In production (real isProduction === true or simulated for tests),
    // this provider is UNCONDITIONALLY blocked from storing or retrieving data.
    // allowInCurrentEnv: true CANNOT bypass production mode.
    const isProd = isProduction || options?.simulateProduction === true;
    this.isBlockedInEnv = isProd || options?.allowInCurrentEnv === false;
  }

  private assertEnvironmentAllowed(): void {
    if (this.isBlockedInEnv) {
      throw new AppError(
        'ATTACHMENT_STORAGE_UNAVAILABLE',
        'مزود التخزين في الذاكرة مخصص لبيئة الاختبار والتطوير فقط ولا يُسمح بتفعيله في بيئة الإنتاج',
      );
    }
  }

  public setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  public hasKey(storageKey: string): boolean {
    return this.objects.has(storageKey);
  }

  public size(): number {
    return this.objects.size;
  }

  public clear(): void {
    this.objects.clear();
  }

  /**
   * Test-only helper to corrupt stored bytes and verify integrity-check failures on retrieval.
   */
  public corruptEntryForTest(storageKey: string, corruptedBytes: Buffer): void {
    const existing = this.objects.get(storageKey);
    if (existing) {
      this.objects.set(storageKey, {
        ...existing,
        bytes: Buffer.from(corruptedBytes),
      });
    }
  }

  public async putObject(input: PutAttachmentObjectInput): Promise<PutAttachmentObjectResult> {
    this.assertEnvironmentAllowed();

    if (!this.healthy) {
      throw new AppError('ATTACHMENT_STORAGE_UNAVAILABLE', 'خدمة تخزين المرفقات غير متاحة حالياً');
    }

    const storageKey = input.storageKey ?? generateOpaqueStorageKey();
    assertSafeStorageKey(storageKey);

    if (this.objects.has(storageKey)) {
      throw new AppError('CONFLICT', 'تعارض في مفتاح تخزين المرفق');
    }

    const copy = Buffer.from(input.bytes);
    const actualChecksum = computeSha256Hex(copy);
    if (actualChecksum !== input.checksumSha256 || copy.byteLength !== input.sizeBytes) {
      throw new AppError('ATTACHMENT_INTEGRITY_ERROR', 'فشل التحقق من سلامة بيانات المرفق قبل التخزين');
    }

    this.objects.set(storageKey, {
      bytes: copy,
      mimeType: input.mimeType,
      sizeBytes: copy.byteLength,
      checksumSha256: actualChecksum,
      createdAt: new Date(),
    });

    return {
      storageKey,
      sizeBytes: copy.byteLength,
      checksumSha256: actualChecksum,
    };
  }

  public async getObjectBytes(storageKey: string): Promise<StoredAttachmentObject> {
    assertSafeStorageKey(storageKey);
    this.assertEnvironmentAllowed();

    if (!this.healthy) {
      throw new AppError('ATTACHMENT_STORAGE_UNAVAILABLE', 'خدمة تخزين المرفقات غير متاحة حالياً');
    }

    const entry = this.objects.get(storageKey);
    if (!entry) {
      throw new AppError('NOT_FOUND', 'ملف المرفق غير موجود في وحدة التخزين');
    }

    const copy = Buffer.from(entry.bytes);
    const actualChecksum = computeSha256Hex(copy);

    return {
      bytes: copy,
      sizeBytes: copy.byteLength,
      checksumSha256: actualChecksum,
    };
  }

  public async deleteObject(storageKey: string): Promise<void> {
    assertSafeStorageKey(storageKey);
    this.objects.delete(storageKey);
  }

  public async checkHealth(): Promise<{ available: boolean; reason?: string }> {
    if (this.isBlockedInEnv) {
      return { available: false, reason: 'In-memory storage provider is disabled in production' };
    }
    return this.healthy
      ? { available: true }
      : { available: false, reason: 'In-memory provider marked unhealthy' };
  }
}

// ---------------------------------------------------------------------------
// 2. Private Local Development Storage Provider (Non-Production Only)
// ---------------------------------------------------------------------------

export type LocalPrivateStorageOptions = {
  rootDir?: string | undefined;
  /**
   * Test-only option to simulate production mode.
   */
  simulateProduction?: boolean | undefined;
  /**
   * Deprecated test-only option. Passing true CANNOT bypass real or simulated production mode.
   */
  allowInCurrentEnv?: boolean | undefined;
};

export class LocalPrivateStorageProvider implements AttachmentStorageProvider {
  public readonly providerName = 'local_dev';
  private readonly rootDir: string;
  private readonly isBlockedInEnv: boolean;

  constructor(options?: LocalPrivateStorageOptions) {
    // SECURITY HARDENING: In production (real isProduction === true or simulated for tests),
    // this provider is UNCONDITIONALLY blocked from storing or retrieving data.
    // allowInCurrentEnv: true CANNOT bypass production mode.
    const isProd = isProduction || options?.simulateProduction === true;
    this.isBlockedInEnv = isProd || options?.allowInCurrentEnv === false;

    const configuredDir =
      options?.rootDir ??
      env.ATTACHMENT_LOCAL_STORAGE_DIR ??
      path.resolve(process.cwd(), '.storage', 'attachments');

    const resolvedRoot = path.resolve(configuredDir);
    const publicDir = path.resolve(process.cwd(), 'public');

    // Never allow storing files inside `public/` or any subdirectory of `public/`
    const relToPublic = path.relative(publicDir, resolvedRoot);
    if (relToPublic === '' || (!relToPublic.startsWith('..') && !path.isAbsolute(relToPublic))) {
      throw new Error(
        'SECURITY VIOLATION: Attachment storage directory must never be inside the public/ directory.',
      );
    }

    this.rootDir = resolvedRoot;
  }

  private assertEnvironmentAllowed(): void {
    if (this.isBlockedInEnv) {
      throw new AppError(
        'ATTACHMENT_STORAGE_UNAVAILABLE',
        'مزود التخزين المحلي مخصص لبيئة التطوير والاختبار فقط ولا يُسمح بتفعيله في بيئة الإنتاج',
      );
    }
  }

  private resolveSafeObjectPath(storageKey: string): string {
    assertSafeStorageKey(storageKey);

    const candidatePath = path.resolve(this.rootDir, storageKey);
    const relative = path.relative(this.rootDir, candidatePath);

    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      relative.includes(path.sep) ||
      relative !== storageKey
    ) {
      throw new AppError('VALIDATION_ERROR', 'مسار مفتاح التخزين غير آمن');
    }

    return candidatePath;
  }

  public async putObject(input: PutAttachmentObjectInput): Promise<PutAttachmentObjectResult> {
    this.assertEnvironmentAllowed();

    const storageKey = input.storageKey ?? generateOpaqueStorageKey();
    const targetPath = this.resolveSafeObjectPath(storageKey);

    const actualChecksum = computeSha256Hex(input.bytes);
    if (actualChecksum !== input.checksumSha256 || input.bytes.byteLength !== input.sizeBytes) {
      throw new AppError('ATTACHMENT_INTEGRITY_ERROR', 'فشل التحقق من سلامة بيانات المرفق قبل التخزين');
    }

    try {
      await fs.mkdir(this.rootDir, { recursive: true });
      // 'wx' flag fails if the file already exists (prevents overwriting)
      await fs.writeFile(targetPath, input.bytes, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      const errCode = (error as NodeJS.ErrnoException)?.code;
      if (errCode === 'EEXIST') {
        throw new AppError('CONFLICT', 'تعارض في مفتاح تخزين المرفق');
      }
      logger.error('attachments.local_storage_write_failed', {
        provider: this.providerName,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new AppError('ATTACHMENT_STORAGE_UNAVAILABLE', 'تعذر حفظ ملف المرفق في وحدة التخزين');
    }

    return {
      storageKey,
      sizeBytes: input.bytes.byteLength,
      checksumSha256: actualChecksum,
    };
  }

  public async getObjectBytes(storageKey: string): Promise<StoredAttachmentObject> {
    this.assertEnvironmentAllowed();
    const targetPath = this.resolveSafeObjectPath(storageKey);

    try {
      const bytes = await fs.readFile(targetPath);
      const checksumSha256 = computeSha256Hex(bytes);
      return {
        bytes,
        sizeBytes: bytes.byteLength,
        checksumSha256,
      };
    } catch (error) {
      const errCode = (error as NodeJS.ErrnoException)?.code;
      if (errCode === 'ENOENT') {
        throw new AppError('NOT_FOUND', 'ملف المرفق غير موجود في وحدة التخزين');
      }
      logger.error('attachments.local_storage_read_failed', {
        provider: this.providerName,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new AppError('ATTACHMENT_STORAGE_UNAVAILABLE', 'تعذر قراءة ملف المرفق من وحدة التخزين');
    }
  }

  public async deleteObject(storageKey: string): Promise<void> {
    this.assertEnvironmentAllowed();
    const targetPath = this.resolveSafeObjectPath(storageKey);

    try {
      await fs.unlink(targetPath);
    } catch (error) {
      const errCode = (error as NodeJS.ErrnoException)?.code;
      if (errCode === 'ENOENT') {
        return;
      }
      logger.warn('attachments.local_storage_delete_failed', {
        provider: this.providerName,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  public async checkHealth(): Promise<{ available: boolean; reason?: string }> {
    if (this.isBlockedInEnv) {
      return { available: false, reason: 'Local storage provider disabled in production' };
    }
    try {
      await fs.mkdir(this.rootDir, { recursive: true });
      return { available: true };
    } catch {
      return { available: false, reason: 'Local storage directory inaccessible' };
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Unconfigured / Disabled Storage Provider (Fail-Closed Production Default)
// ---------------------------------------------------------------------------

export class UnconfiguredStorageProvider implements AttachmentStorageProvider {
  public readonly providerName = 'disabled';

  public async putObject(_input: PutAttachmentObjectInput): Promise<PutAttachmentObjectResult> {
    throw new AppError(
      'ATTACHMENT_STORAGE_UNAVAILABLE',
      'لم يتم اعتماد أو تهيئة مزود تخزين المرفقات لبيئة الإنتاج بعد',
    );
  }

  public async getObjectBytes(_storageKey: string): Promise<StoredAttachmentObject> {
    throw new AppError(
      'ATTACHMENT_STORAGE_UNAVAILABLE',
      'لم يتم اعتماد أو تهيئة مزود تخزين المرفقات لبيئة الإنتاج بعد',
    );
  }

  public async deleteObject(_storageKey: string): Promise<void> {
    // No-op when unconfigured
  }

  public async checkHealth(): Promise<{ available: boolean; reason?: string }> {
    return {
      available: false,
      reason: 'Production attachment storage provider has not been selected by the Owner',
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton & Test Override Management
// ---------------------------------------------------------------------------

const defaultMemoryProvider = new InMemoryAttachmentStorageProvider();
let customStorageProviderOverride: AttachmentStorageProvider | null = null;

/**
 * Allows unit and integration tests to inject a specific storage provider
 * (or reset to the default provider by passing `null`).
 */
export function setAttachmentStorageProvider(provider: AttachmentStorageProvider | null): void {
  customStorageProviderOverride = provider;
}

export type StorageResolutionOptions = {
  nodeEnv?: 'development' | 'test' | 'production' | string | undefined;
  configuredProvider?: 'disabled' | 'memory' | 'local_dev' | string | undefined;
  allowTestOverride?: boolean | undefined;
};

/**
 * Centralized resolution and guard for attachment storage providers.
 *
 * Invariants (AGENTS.md §12, §18; Attachment Hardening):
 * 1. In production ('production'):
 *    - 'memory' is strictly rejected with ATTACHMENT_STORAGE_UNAVAILABLE.
 *    - 'local_dev' is strictly rejected with ATTACHMENT_STORAGE_UNAVAILABLE.
 *    - Any override matching 'memory' or 'local_dev' is rejected with ATTACHMENT_STORAGE_UNAVAILABLE.
 *    - Unconfigured or 'disabled' returns UnconfiguredStorageProvider (fail-closed).
 * 2. In non-production ('development', 'test'):
 *    - 'local_dev' returns LocalPrivateStorageProvider.
 *    - 'memory' returns InMemoryAttachmentStorageProvider.
 *    - In 'test', defaults to InMemoryAttachmentStorageProvider unless configured.
 *    - 'disabled' returns UnconfiguredStorageProvider.
 */
export function resolveAttachmentStorageProvider(
  options?: StorageResolutionOptions,
): AttachmentStorageProvider {
  const currentEnv = options?.nodeEnv ?? env.NODE_ENV;
  // SECURITY HARDENING: Production mode is unconditionally active whenever the runtime
  // is production (isProduction === true) or when explicitly requested via options.
  // It CANNOT be downgraded to development or test by passing options in a production runtime.
  const isProd = isProduction || currentEnv === 'production';

  if (options?.allowTestOverride !== false && customStorageProviderOverride) {
    if (isProd) {
      const overrideName = customStorageProviderOverride.providerName;
      if (overrideName === 'memory' || overrideName === 'local_dev') {
        throw new AppError(
          'ATTACHMENT_STORAGE_UNAVAILABLE',
          'مزود تخزين المرفقات المحدد غير مسموح به في بيئة الإنتاج',
        );
      }
    }
    return customStorageProviderOverride;
  }

  const configured = options?.configuredProvider ?? env.ATTACHMENT_STORAGE_PROVIDER;

  if (isProd) {
    if (configured === 'memory') {
      throw new AppError(
        'ATTACHMENT_STORAGE_UNAVAILABLE',
        'مزود التخزين في الذاكرة غير مسموح به في بيئة الإنتاج',
      );
    }
    if (configured === 'local_dev') {
      throw new AppError(
        'ATTACHMENT_STORAGE_UNAVAILABLE',
        'مزود التخزين المحلي غير مسموح به في بيئة الإنتاج',
      );
    }
    return new UnconfiguredStorageProvider();
  }

  if (configured === 'local_dev') {
    return new LocalPrivateStorageProvider();
  }

  if (configured === 'disabled') {
    return new UnconfiguredStorageProvider();
  }

  if (configured === 'memory' || currentEnv === 'test') {
    return defaultMemoryProvider;
  }

  return new UnconfiguredStorageProvider();
}

/**
 * Returns the active `AttachmentStorageProvider` using centralized resolution.
 */
export function getAttachmentStorageProvider(): AttachmentStorageProvider {
  return resolveAttachmentStorageProvider();
}

export function getDefaultMemoryStorageProvider(): InMemoryAttachmentStorageProvider {
  return defaultMemoryProvider;
}


/**
 * lib/logger/correlation.ts
 *
 * Request and transaction correlation context using Node.js AsyncLocalStorage.
 * Allows tracing operational events, errors, and database transactions
 * across asynchronous execution boundaries without manual parameter drilling.
 *
 * Follows AGENTS.md §9, §12 and Slice 19 Observability specifications.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const correlationStorage = new AsyncLocalStorage<string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the correlation ID for the current asynchronous execution context,
 * or undefined if running outside a tracked context.
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

/**
 * Runs a function within a designated correlation ID context.
 */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return correlationStorage.run(correlationId, fn);
}

/**
 * Generates a standard secure correlation ID (UUID v4).
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Sanitizes an incoming correlation/request ID to prevent header injection or malformed data.
 * If invalid or absent, returns a newly generated correlation ID.
 */
export function sanitizeCorrelationId(rawId?: string | null): string {
  if (!rawId || typeof rawId !== 'string') {
    return generateCorrelationId();
  }

  const trimmed = rawId.trim();
  // Safe alphanumeric, hyphen, underscore between 8 and 64 characters
  const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;
  if (SAFE_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return generateCorrelationId();
}

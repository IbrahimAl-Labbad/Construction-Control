/**
 * lib/errors/action-error-handler.ts
 *
 * Centralized error handler for Server Actions.
 * Converts domain errors, validation errors, and auth/permission errors into
 * safe, structured ActionFailure objects without leaking database internals or stack traces.
 *
 * Follows AGENTS.md §12, §16, and Phase 2 D4 refactoring contract.
 */

import { AuthError } from '@/lib/auth/session';
import { AppError, ValidationError } from '@/lib/errors';
import { PermissionError } from '@/lib/permissions/guards';

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export interface HandleActionErrorOptions {
  fallbackMessage?: string;
}

/**
 * Maps any error caught in a Server Action to a structured, safe ActionFailure.
 * Never exposes SQL queries, internal stack traces, or sensitive server internals.
 */
export function handleActionError(
  error: unknown,
  fallbackOrOptions?: string | HandleActionErrorOptions,
): ActionFailure {
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message || 'بيانات غير صالحة',
      details: error.details,
    };
  }

  if (error instanceof AppError) {
    return {
      success: false,
      error: error.code,
      message: error.message,
    };
  }

  if (error instanceof PermissionError) {
    return {
      success: false,
      error: error.code || 'FORBIDDEN',
      message: error.message || 'غير مصرح بهذا الإجراء',
    };
  }

  if (error instanceof AuthError) {
    return {
      success: false,
      error: error.code || 'UNAUTHENTICATED',
      message: error.message || 'يرجى تسجيل الدخول أولاً',
    };
  }

  const fallbackMessage =
    typeof fallbackOrOptions === 'string'
      ? fallbackOrOptions
      : fallbackOrOptions?.fallbackMessage;

  // Never leak internal database errors, SQL queries, or stack traces
  return {
    success: false,
    error: 'INTERNAL_ERROR',
    message: fallbackMessage || 'حدث خطأ غير متوقع في الخادم',
  };
}

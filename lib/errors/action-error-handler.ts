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
import { logger, type LogContext, getCorrelationId } from '@/lib/logger';
import { PermissionError } from '@/lib/permissions/guards';

export type ActionFailure = {
  success: false;
  error: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
};

export interface HandleActionErrorOptions {
  fallbackMessage?: string | undefined;
  actionName?: string | undefined;
  userId?: string | undefined;
  role?: string | undefined;
  correlationId?: string | undefined;
  entityId?: string | undefined;
  [key: string]: unknown;
}

/**
 * Maps any error caught in a Server Action to a structured, safe ActionFailure.
 * Never exposes SQL queries, internal stack traces, or sensitive server internals.
 * Logs internal diagnostics safely server-side with correlation tracking.
 */
export function handleActionError(
  error: unknown,
  fallbackOrOptions?: string | HandleActionErrorOptions,
): ActionFailure {
  const options =
    typeof fallbackOrOptions === 'string'
      ? { fallbackMessage: fallbackOrOptions }
      : fallbackOrOptions;

  const correlationId = options?.correlationId ?? getCorrelationId();
  const baseContext: LogContext = {
    correlationId,
    userId: options?.userId,
    role: options?.role,
    action: options?.actionName,
    entityId: options?.entityId,
  };

  if (error instanceof ValidationError) {
    logger.warn('action.validation_error', {
      ...baseContext,
      details: error.details,
    });
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message || 'بيانات غير صالحة',
      details: error.details,
    };
  }

  if (error instanceof PermissionError) {
    logger.warn('action.authorization_failure', {
      ...baseContext,
      code: error.code,
      requiredRoles: error.requiredRoles,
      actualRole: error.actualRole,
    });
    return {
      success: false,
      error: error.code || 'FORBIDDEN',
      message: error.message || 'غير مصرح بهذا الإجراء',
    };
  }

  if (error instanceof AuthError) {
    logger.warn(
      error.code === 'ACCOUNT_INACTIVE'
        ? 'auth.inactive_user'
        : 'auth.authentication_failure',
      {
        ...baseContext,
        code: error.code,
      },
    );
    return {
      success: false,
      error: error.code || 'UNAUTHENTICATED',
      message: error.message || 'يرجى تسجيل الدخول أولاً',
    };
  }

  if (error instanceof AppError) {
    const isObjectAuthError =
      error.code === 'FORBIDDEN' || error.code === 'FORBIDDEN_SELF_APPROVAL';
    logger.warn(
      isObjectAuthError
        ? 'action.object_authorization_failure'
        : 'action.domain_error',
      {
        ...baseContext,
        code: error.code,
        message: error.message,
      },
    );
    return {
      success: false,
      error: error.code,
      message: error.message,
    };
  }

  // Generic / Unexpected / Database Error:
  // Log full diagnostic technical details server-side safely.
  const isErrorObj = error instanceof Error;
  logger.error('action.internal_error', {
    ...baseContext,
    errorType: isErrorObj ? error.name : typeof error,
    errorMessage: isErrorObj ? error.message : String(error),
    stack: isErrorObj ? error.stack : undefined,
  });

  // Never leak internal database errors, SQL queries, or stack traces to client
  return {
    success: false,
    error: 'INTERNAL_ERROR',
    message: options?.fallbackMessage || 'حدث خطأ غير متوقع في الخادم',
  };
}

/**
 * lib/errors/index.ts
 *
 * Centralized error types and handling utilities.
 *
 * Error handling strategy:
 * - Application errors are typed (never generic Error)
 * - Error responses are structured (never raw exception messages to users)
 * - Internal details (stack traces, DB queries) are logged, not exposed
 * - HTTP status codes are consistently mapped
 *
 * See AGENTS.md §17 for error handling rules.
 *
 * Usage:
 *   import { AppError, ErrorCode } from '@/lib/errors';
 *   throw new AppError('NOT_FOUND', 'المشروع غير موجود');
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/**
 * Exhaustive list of application error codes.
 * Add new codes here as new modules are implemented.
 */
export type ErrorCode =
  // Authentication
  | 'UNAUTHENTICATED'
  | 'ACCOUNT_INACTIVE'
  // Authorization
  | 'FORBIDDEN'
  | 'INSUFFICIENT_ROLE'
  // Validation
  | 'VALIDATION_ERROR'
  // Resources
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'CONFLICT'
  | 'INVALID_MANAGER'
  // Financial integrity
  | 'IMMUTABLE_RECORD'
  | 'INVALID_STATE_TRANSITION'
  | 'BUDGET_REQUIRED'
  | 'INVALID_PROJECT_STATUS'
  | 'EMPTY_BUDGET'
  | 'BUDGET_LINE_EXCEEDED'
  | 'FORBIDDEN_SELF_APPROVAL'
  | 'EXPENSE_NOT_DRAFT'
  | 'COMMITMENT_NOT_DRAFT'
  | 'RECORD_DELETED'
  | 'BUDGET_NOT_APPROVED'
  | 'INVALID_BUDGET_LINE'
  // Custody specific errors
  | 'CUSTODY_BALANCE_EXCEEDED'
  | 'ACTIVE_CUSTODY_EXISTS'
  | 'CUSTODY_NOT_ISSUED'
  | 'INVALID_CUSTODIAN'
  | 'CUSTODY_ALREADY_SETTLED'
  | 'CASH_RETURN_EXCEEDS_BALANCE'
  | 'CANNOT_CANCEL_ISSUED_CUSTODY'
  | 'CUSTODY_NOT_DRAFT'
  | 'INVALID_EXPENSE_LINKAGE'
  // Subcontractor Billing specific errors (Vertical Slice 7)
  | 'COMMITMENT_NOT_APPROVED'
  | 'INVALID_COMMITMENT_LINKAGE'
  | 'COMMITMENT_CEILING_EXCEEDED'
  | 'SUBCONTRACTOR_NAME_MISMATCH'
  | 'RECORD_NOT_EDITABLE'
  | 'CANNOT_CANCEL_APPROVED_BILLING'
  | 'BILLING_ALREADY_CANCELLED'
  // Payroll specific errors (Vertical Slice 8)
  | 'DUPLICATE_PAYROLL_ENTRY'
  | 'INVALID_PAYROLL_PERIOD'
  | 'INVALID_PAYROLL_AMOUNT'
  | 'INVALID_PAYROLL_CURRENCY'
  | 'INVALID_BUDGET_LINE_CATEGORY'
  // General
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

// ---------------------------------------------------------------------------
// HTTP status mapping
// ---------------------------------------------------------------------------

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  ACCOUNT_INACTIVE: 401,
  FORBIDDEN: 403,
  INSUFFICIENT_ROLE: 403,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  CONFLICT: 409,
  INVALID_MANAGER: 400,
  IMMUTABLE_RECORD: 422,
  INVALID_STATE_TRANSITION: 422,
  BUDGET_REQUIRED: 422,
  INVALID_PROJECT_STATUS: 400,
  EMPTY_BUDGET: 400,
  BUDGET_LINE_EXCEEDED: 422,
  FORBIDDEN_SELF_APPROVAL: 403,
  EXPENSE_NOT_DRAFT: 422,
  COMMITMENT_NOT_DRAFT: 422,
  RECORD_DELETED: 400,
  BUDGET_NOT_APPROVED: 422,
  INVALID_BUDGET_LINE: 400,
  CUSTODY_BALANCE_EXCEEDED: 422,
  ACTIVE_CUSTODY_EXISTS: 409,
  CUSTODY_NOT_ISSUED: 422,
  INVALID_CUSTODIAN: 400,
  CUSTODY_ALREADY_SETTLED: 422,
  CASH_RETURN_EXCEEDS_BALANCE: 422,
  CANNOT_CANCEL_ISSUED_CUSTODY: 422,
  CUSTODY_NOT_DRAFT: 422,
  INVALID_EXPENSE_LINKAGE: 422,
  // Subcontractor Billing (Vertical Slice 7)
  COMMITMENT_NOT_APPROVED: 422,
  INVALID_COMMITMENT_LINKAGE: 422,
  COMMITMENT_CEILING_EXCEEDED: 422,
  SUBCONTRACTOR_NAME_MISMATCH: 422,
  RECORD_NOT_EDITABLE: 422,
  CANNOT_CANCEL_APPROVED_BILLING: 422,
  BILLING_ALREADY_CANCELLED: 422,
  // Payroll (Vertical Slice 8)
  DUPLICATE_PAYROLL_ENTRY: 409,
  INVALID_PAYROLL_PERIOD: 400,
  INVALID_PAYROLL_AMOUNT: 400,
  INVALID_PAYROLL_CURRENCY: 400,
  INVALID_BUDGET_LINE_CATEGORY: 400,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// ---------------------------------------------------------------------------
// Application error class
// ---------------------------------------------------------------------------

/**
 * The base application error class.
 *
 * All thrown errors in application code should be AppError instances.
 * This ensures consistent error handling and response formatting.
 *
 * Internal details (cause, stack) are logged but never sent to clients.
 *
 * @example
 * throw new AppError('NOT_FOUND', 'المشروع غير موجود');
 * throw new AppError('FORBIDDEN', 'ليس لديك صلاحية', { cause: originalError });
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;

  constructor(
    code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = ERROR_HTTP_STATUS[code];
  }
}

// ---------------------------------------------------------------------------
// Error response type (sent to clients)
// ---------------------------------------------------------------------------

/**
 * The structured error response sent to API clients.
 * Never includes stack traces or internal implementation details.
 */
export interface ErrorResponse {
  error: ErrorCode;
  message: string;
  details?: Array<{ path: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Error classification helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the error is an AppError with the given code.
 */
export function isAppError(error: unknown, code?: ErrorCode): error is AppError {
  if (!(error instanceof AppError)) return false;
  if (code !== undefined) return error.code === code;
  return true;
}

/**
 * Converts any unknown error to an AppError.
 *
 * Used in catch blocks to ensure consistent error typing.
 * Unknown errors are wrapped as INTERNAL_ERROR.
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   const appError = toAppError(error);
 *   logger.error('Operation failed', { code: appError.code });
 *   throw appError;
 * }
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Error) {
    return new AppError('INTERNAL_ERROR', 'حدث خطأ غير متوقع', {
      cause: error,
    });
  }

  return new AppError('INTERNAL_ERROR', 'حدث خطأ غير متوقع');
}

/**
 * Formats an AppError into a safe error response for clients.
 * Never exposes internal details.
 */
export function formatErrorResponse(error: AppError): ErrorResponse {
  return {
    error: error.code,
    message: error.message,
  };
}

// ---------------------------------------------------------------------------
// Validation error — carries field-level details
// ---------------------------------------------------------------------------

/**
 * Thrown by use cases when Zod schema validation fails.
 * Includes field-level details for structured client responses.
 *
 * Caught by server actions to return safe, structured error responses.
 * Internal implementation details are never exposed.
 *
 * @example
 * const validation = validate(createUserSchema, input);
 * if (!validation.success) {
 *   throw new ValidationError(validation.errors);
 * }
 */
export class ValidationError extends AppError {
  public readonly details: Array<{ path: string; message: string }>;

  constructor(details: Array<{ path: string; message: string }>) {
    super('VALIDATION_ERROR', 'بيانات غير صالحة');
    this.name = 'ValidationError';
    this.details = details;
  }
}

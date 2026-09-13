/**
 * tests/unit/lib/errors.test.ts
 *
 * Unit tests for the application error handling system.
 */

import { describe, expect, it } from 'vitest';
import {
  AppError,
  ERROR_HTTP_STATUS,
  formatErrorResponse,
  isAppError,
  toAppError,
} from '@/lib/errors';

describe('AppError', () => {
  it('instantiates with proper code, message, and mapped HTTP status', () => {
    const error = new AppError('NOT_FOUND', 'المشروع غير موجود');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('المشروع غير موجود');
    expect(error.httpStatus).toBe(404);
  });

  it('maps all defined error codes to valid HTTP statuses', () => {
    expect(ERROR_HTTP_STATUS.UNAUTHENTICATED).toBe(401);
    expect(ERROR_HTTP_STATUS.ACCOUNT_INACTIVE).toBe(401);
    expect(ERROR_HTTP_STATUS.FORBIDDEN).toBe(403);
    expect(ERROR_HTTP_STATUS.INSUFFICIENT_ROLE).toBe(403);
    expect(ERROR_HTTP_STATUS.VALIDATION_ERROR).toBe(400);
    expect(ERROR_HTTP_STATUS.NOT_FOUND).toBe(404);
    expect(ERROR_HTTP_STATUS.ALREADY_EXISTS).toBe(409);
    expect(ERROR_HTTP_STATUS.CONFLICT).toBe(409);
    expect(ERROR_HTTP_STATUS.IMMUTABLE_RECORD).toBe(422);
    expect(ERROR_HTTP_STATUS.INVALID_STATE_TRANSITION).toBe(422);
    expect(ERROR_HTTP_STATUS.INTERNAL_ERROR).toBe(500);
    expect(ERROR_HTTP_STATUS.SERVICE_UNAVAILABLE).toBe(503);
  });

  it('correctly identifies AppError instances via isAppError', () => {
    const appErr = new AppError('FORBIDDEN', 'ممنوع');
    const standardErr = new Error('Generic error');

    expect(isAppError(appErr)).toBe(true);
    expect(isAppError(appErr, 'FORBIDDEN')).toBe(true);
    expect(isAppError(appErr, 'NOT_FOUND')).toBe(false);
    expect(isAppError(standardErr)).toBe(false);
    expect(isAppError('string error')).toBe(false);
    expect(isAppError(null)).toBe(false);
  });

  it('converts unknown errors to AppError via toAppError', () => {
    const standardErr = new Error('Database disconnected');
    const converted = toAppError(standardErr);

    expect(converted).toBeInstanceOf(AppError);
    expect(converted.code).toBe('INTERNAL_ERROR');
    expect(converted.cause).toBe(standardErr);

    const nonError = toAppError('Something weird');
    expect(nonError).toBeInstanceOf(AppError);
    expect(nonError.code).toBe('INTERNAL_ERROR');

    const alreadyAppError = new AppError('VALIDATION_ERROR', 'بيانات خاطئة');
    expect(toAppError(alreadyAppError)).toBe(alreadyAppError);
  });

  it('formats AppError safely for client consumption without leaking internal data', () => {
    const error = new AppError('IMMUTABLE_RECORD', 'لا يمكن تعديل السجل المعتمد');
    const formatted = formatErrorResponse(error);

    expect(formatted).toEqual({
      error: 'IMMUTABLE_RECORD',
      message: 'لا يمكن تعديل السجل المعتمد',
    });
    expect((formatted as unknown as Record<string, unknown>)['stack']).toBeUndefined();
  });
});

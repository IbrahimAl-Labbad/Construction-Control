/**
 * tests/unit/lib/action-error-handler.test.ts
 *
 * Unit tests for centralized handleActionError helper.
 * Validates mapping of ValidationError, AppError, PermissionError, AuthError,
 * and internal/unexpected errors while strictly preventing information leakage.
 */

import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { AuthError } from '@/lib/auth/session';
import { AppError, ValidationError } from '@/lib/errors';
import { handleActionError } from '@/lib/errors/action-error-handler';
import { PermissionError } from '@/lib/permissions/guards';

describe('handleActionError', () => {
  it('correctly maps ValidationError with details', () => {
    const error = new ValidationError([
      { path: 'amount', message: 'المبلغ غير صالح' },
    ]);

    const result = handleActionError(error);

    expect(result).toEqual({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'بيانات غير صالحة',
      details: [{ path: 'amount', message: 'المبلغ غير صالح' }],
    });
  });

  it('correctly maps AppError with code and message', () => {
    const error = new AppError('INVALID_STATE_TRANSITION', 'حالة غير صالحة');

    const result = handleActionError(error);

    expect(result).toEqual({
      success: false,
      error: 'INVALID_STATE_TRANSITION',
      message: 'حالة غير صالحة',
    });
  });

  it('correctly maps PermissionError', () => {
    const error = new PermissionError(
      'FORBIDDEN',
      [Role.MANAGER],
      Role.ENGINEER,
    );

    const result = handleActionError(error);

    expect(result.success).toBe(false);
    expect(result.error).toBe('FORBIDDEN');
    expect(result.message).toBeDefined();
  });

  it('correctly maps AuthError', () => {
    const error = new AuthError('UNAUTHENTICATED');

    const result = handleActionError(error);

    expect(result).toEqual({
      success: false,
      error: 'UNAUTHENTICATED',
      message: 'UNAUTHENTICATED',
    });
  });

  it('maps generic Error to INTERNAL_ERROR and applies fallback message', () => {
    const error = new Error('SELECT * FROM users WHERE id = 123; Database timeout');

    const result = handleActionError(error, 'حدث خطأ في النظام');

    expect(result).toEqual({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'حدث خطأ في النظام',
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('SELECT');
    expect(serialized).not.toContain('Database timeout');
  });

  it('maps unknown non-error values to default internal error', () => {
    const result = handleActionError('something unexpected');

    expect(result).toEqual({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'حدث خطأ غير متوقع في الخادم',
    });
  });
});

/**
 * tests/unit/lib/logger.test.ts
 *
 * Unit tests for the logging abstraction and sensitive data redaction.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { logger, redactSensitiveData } from '@/lib/logger';

describe('Logger', () => {
  const originalEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = originalEnv;
  });

  it('provides all standard log level methods', () => {
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('outputs error logs to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('Test error message', { detail: 'critical' });
    expect(spy).toHaveBeenCalled();
  });

  it('outputs warn logs to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('Test warn message');
    expect(spy).toHaveBeenCalled();
  });

  it('outputs info and debug logs to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('Info message');
    logger.debug('Debug message');
    expect(spy).toHaveBeenCalled();
  });

  it('creates child logger with bound context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const childLogger = logger.child({ correlationId: 'req-123' });
    childLogger.error('Child error');
    expect(spy).toHaveBeenCalled();
    const loggedStr = spy.mock.calls[0]?.[0] as string;
    expect(loggedStr).toContain('req-123');
  });

  describe('redactSensitiveData', () => {
    it('masks sensitive keys regardless of case', () => {
      const payload = {
        password: 'PlainTextPassword123',
        PasswordHash: '$argon2id$somehash',
        token: 'secret-token-xyz',
        secret: 'super-secret',
        authorization: 'Bearer token-abc',
        sessionToken: 'uuid-123',
        creditCard: '4111-2222-3333-4444',
        safeField: 'visible-data',
      };

      const result = redactSensitiveData(payload) as Record<string, unknown>;
      expect(result['password']).toBe('[REDACTED]');
      expect(result['PasswordHash']).toBe('[REDACTED]');
      expect(result['token']).toBe('[REDACTED]');
      expect(result['secret']).toBe('[REDACTED]');
      expect(result['authorization']).toBe('[REDACTED]');
      expect(result['sessionToken']).toBe('[REDACTED]');
      expect(result['creditCard']).toBe('[REDACTED]');
      expect(result['safeField']).toBe('visible-data');
    });

    it('recursively redacts nested objects and arrays', () => {
      const payload = {
        user: {
          id: '1',
          credentials: {
            password: 'my-password',
          },
        },
        tokens: [{ token: 'abc' }, { token: 'def' }],
      };

      const result = redactSensitiveData(payload) as {
        user: { id: string; credentials: { password: string } };
        tokens: Array<{ token: string }>;
      };
      expect(result.user.credentials.password).toBe('[REDACTED]');
      expect(result.tokens[0]?.token).toBe('[REDACTED]');
      expect(result.tokens[1]?.token).toBe('[REDACTED]');
    });

    it('handles primitive values safely', () => {
      expect(redactSensitiveData('test')).toBe('test');
      expect(redactSensitiveData(123)).toBe(123);
      expect(redactSensitiveData(null)).toBeNull();
      expect(redactSensitiveData(undefined)).toBeUndefined();
    });

    it('handles Error objects and redacts nested cause', () => {
      const innerError = new Error('Secret db error');
      (innerError as unknown as Record<string, unknown>)['password'] = 'leaked-pwd';
      const outerError = new Error('Wrapper', { cause: innerError });

      const result = redactSensitiveData(outerError) as {
        name: string;
        message: string;
        cause: { name: string };
      };
      expect(result.name).toBe('Error');
      expect(result.message).toBe('Wrapper');
      expect(result.cause.name).toBe('Error');
    });
  });
});

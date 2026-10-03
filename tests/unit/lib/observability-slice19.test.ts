/**
 * tests/unit/lib/observability-slice19.test.ts
 *
 * Comprehensive test suite for Slice 19 Production Observability,
 * Operational Resilience, Correlation IDs, Error Boundary Hardening,
 * Authorization Observability, Health/Readiness, and Configuration Safety.
 *
 * Verifies AGENTS.md §9, §12, §16, §18 and Slice 19 specifications.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

import {
  logger,
  redactSensitiveData,
  getCorrelationId,
  runWithCorrelationId,
  generateCorrelationId,
  sanitizeCorrelationId,
} from '@/lib/logger';
import { handleActionError } from '@/lib/errors/action-error-handler';
import { AppError } from '@/lib/errors';
import { PermissionError, requireRole } from '@/lib/permissions/guards';
import type * as SessionModule from '@/lib/auth/session';
import { validateEnvConfig } from '@/lib/config/env';
import { GET as healthRouteHandler } from '@/app/api/health/route';
import { prisma } from '@/lib/db/prisma';

// ---------------------------------------------------------------------------
// Top-level module mocks
// ---------------------------------------------------------------------------

const mockRequireAuth = vi.fn();

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionModule>();
  return {
    ...actual,
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  };
});

describe('Slice 19 — Production Observability & Resilience Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Structured Logging & Correlation IDs
  // -------------------------------------------------------------------------
  describe('Structured Logging & Correlation IDs', () => {
    it('generates a valid UUID v4 correlation ID', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('sanitizes valid incoming correlation IDs and rejects malformed IDs', () => {
      const valid = 'req-trace-123456';
      expect(sanitizeCorrelationId(valid)).toBe(valid);

      // Rejects empty/null/undefined
      expect(sanitizeCorrelationId(null)).toMatch(/^[0-9a-f-]{36}$/i);
      expect(sanitizeCorrelationId('')).toMatch(/^[0-9a-f-]{36}$/i);

      // Rejects unsafe special characters (header injection protection)
      const unsafe = 'req\r\nInjected-Header: bad';
      const sanitized = sanitizeCorrelationId(unsafe);
      expect(sanitized).not.toContain('\r');
      expect(sanitized).not.toContain('\n');
      expect(sanitized).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('automatically binds correlation ID to logs executed inside runWithCorrelationId', () => {
      const testCorrelationId = 'test-corr-uuid-789';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      runWithCorrelationId(testCorrelationId, () => {
        expect(getCorrelationId()).toBe(testCorrelationId);
        logger.info('operation.started', { detail: 'in-context' });
      });

      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain(testCorrelationId);
    });

    it('redacts sensitive fields including credentials, database URLs, and auth secrets', () => {
      const payload = {
        password: 'PlainPassword',
        token: 'auth-jwt-token',
        secret: 'app-secret',
        database_url: 'postgresql://admin:supersecret@db:5432/main',
        nextauth_secret: '32characterslongsecretstring1234',
        connectionString: 'Server=myServer;Password=mypassword;',
        apiKey: 'key-12345',
        sessionToken: 'session-uuid',
        safeProjectCode: 'PRJ-2026-001',
      };

      const redacted = redactSensitiveData(payload) as Record<string, unknown>;
      expect(redacted['password']).toBe('[REDACTED]');
      expect(redacted['token']).toBe('[REDACTED]');
      expect(redacted['secret']).toBe('[REDACTED]');
      expect(redacted['database_url']).toBe('[REDACTED]');
      expect(redacted['nextauth_secret']).toBe('[REDACTED]');
      expect(redacted['connectionString']).toBe('[REDACTED]');
      expect(redacted['apiKey']).toBe('[REDACTED]');
      expect(redacted['sessionToken']).toBe('[REDACTED]');
      expect(redacted['safeProjectCode']).toBe('PRJ-2026-001');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Error Handling Hardening & Safe Diagnostics
  // -------------------------------------------------------------------------
  describe('Error Handling Hardening', () => {
    it('logs internal technical error with stack server-side and returns sanitized client response', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const internalDbError = new Error(
        'FATAL: connection to server at "postgres.internal" failed: password authentication failed',
      );

      const clientResult = handleActionError(internalDbError, {
        fallbackMessage: 'حدث خطأ في النظام',
        actionName: 'approveExpenseAction',
        entityId: 'exp-123',
      });

      // Client response must be completely sanitized
      expect(clientResult.success).toBe(false);
      expect(clientResult.error).toBe('INTERNAL_ERROR');
      expect(clientResult.message).toBe('حدث خطأ في النظام');

      const clientJson = JSON.stringify(clientResult);
      expect(clientJson).not.toContain('postgres.internal');
      expect(clientJson).not.toContain('password authentication');
      expect(clientJson).not.toContain('FATAL');

      // Server-side diagnostic log must capture the technical context
      expect(errorSpy).toHaveBeenCalled();
      const serverLog = errorSpy.mock.calls[0]?.[0] as string;
      expect(serverLog).toContain('action.internal_error');
      expect(serverLog).toContain('approveExpenseAction');
      expect(serverLog).toContain('exp-123');
    });

    it('distinguishes domain errors and logs as warnings without leaking internals', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const domainError = new AppError('BUDGET_LINE_EXCEEDED', 'تجاوز سقف الموازنة');

      const clientResult = handleActionError(domainError);

      expect(clientResult).toEqual({
        success: false,
        error: 'BUDGET_LINE_EXCEEDED',
        message: 'تجاوز سقف الموازنة',
      });

      expect(warnSpy).toHaveBeenCalled();
      const serverLog = warnSpy.mock.calls[0]?.[0] as string;
      expect(serverLog).toContain('action.domain_error');
      expect(serverLog).toContain('BUDGET_LINE_EXCEEDED');
    });

    it('distinguishes object-level authorization failures (FORBIDDEN, FORBIDDEN_SELF_APPROVAL)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const objectAuthError = new AppError('FORBIDDEN_SELF_APPROVAL', 'فصل المهام');

      const clientResult = handleActionError(objectAuthError);

      expect(clientResult.error).toBe('FORBIDDEN_SELF_APPROVAL');
      expect(warnSpy).toHaveBeenCalled();
      const serverLog = warnSpy.mock.calls[0]?.[0] as string;
      expect(serverLog).toContain('action.object_authorization_failure');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Authorization Observability
  // -------------------------------------------------------------------------
  describe('Authorization Observability', () => {
    it('logs auth.role_authorization_failure when user role does not satisfy guard', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockRequireAuth.mockResolvedValueOnce({
        id: 'eng-user-1',
        role: Role.ENGINEER,
        isActive: true,
      });

      await expect(requireRole(Role.MANAGER)).rejects.toThrow(PermissionError);

      expect(warnSpy).toHaveBeenCalled();
      const serverLog = warnSpy.mock.calls[0]?.[0] as string;
      expect(serverLog).toContain('auth.role_authorization_failure');
      expect(serverLog).toContain('eng-user-1');
      expect(serverLog).toContain('ENGINEER');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Health & Readiness Endpoint
  // -------------------------------------------------------------------------
  describe('Health & Readiness Endpoint', () => {
    it('returns 200 with status ok for liveness probe without touching database', async () => {
      const req = new Request('http://localhost:3000/api/health?type=liveness');
      const response = await healthRouteHandler(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe('ok');
      expect(json.type).toBe('liveness');
      expect(json.timestamp).toBeDefined();
    });

    it('returns 200 with status ok and database up for readiness probe when DB is healthy', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ 1: 1 }]);

      const req = new Request('http://localhost:3000/api/health?type=readiness');
      const response = await healthRouteHandler(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe('ok');
      expect(json.type).toBe('readiness');
      expect(json.checks.database).toBe('up');
    });

    it('returns 503 with status unhealthy and no leaked SQL when DB connection fails', async () => {
      vi.spyOn(prisma, '$queryRaw').mockRejectedValue(
        new Error('Connection terminated unexpectedly: secret_db_credentials'),
      );
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = new Request('http://localhost:3000/api/health');
      const response = await healthRouteHandler(req);

      expect(response.status).toBe(503);
      const json = await response.json();
      expect(json.status).toBe('unhealthy');
      expect(json.checks.database).toBe('down');

      // Crucial: no DB credentials or raw SQL in the response body!
      const bodyStr = JSON.stringify(json);
      expect(bodyStr).not.toContain('secret_db_credentials');
      expect(bodyStr).not.toContain('SELECT 1');

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Environment Validation
  // -------------------------------------------------------------------------
  describe('Environment Validation', () => {
    it('validates a complete, valid configuration successfully', () => {
      const validConfig = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://app:pass@localhost:5432/construction_control',
        NEXTAUTH_SECRET: '12345678901234567890123456789012',
        NEXTAUTH_URL: 'https://app.construction-control.sa',
        LOG_LEVEL: 'info',
      };

      const result = validateEnvConfig(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('production');
        expect(result.data.NEXTAUTH_URL).toBe('https://app.construction-control.sa');
      }
    });

    it('fails when mandatory DATABASE_URL is missing without printing secrets', () => {
      const invalidConfig = {
        NODE_ENV: 'production',
        DATABASE_URL: '',
        NEXTAUTH_SECRET: '12345678901234567890123456789012',
        NEXTAUTH_URL: 'https://app.construction-control.sa',
      };

      const result = validateEnvConfig(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.includes('DATABASE_URL'))).toBe(true);
        // Verify no secret value is exposed in error array
        expect(result.errors.join(' ')).not.toContain('12345678901234567890123456789012');
      }
    });

    it('fails when NEXTAUTH_SECRET is too short (< 32 chars)', () => {
      const shortSecretConfig = {
        DATABASE_URL: 'postgresql://app:pass@localhost:5432/construction_control',
        NEXTAUTH_SECRET: 'too-short',
        NEXTAUTH_URL: 'https://app.construction-control.sa',
      };

      const result = validateEnvConfig(shortSecretConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.includes('NEXTAUTH_SECRET'))).toBe(true);
      }
    });

    it('fails when NEXTAUTH_URL is not a valid URL', () => {
      const invalidUrlConfig = {
        DATABASE_URL: 'postgresql://app:pass@localhost:5432/construction_control',
        NEXTAUTH_SECRET: '12345678901234567890123456789012',
        NEXTAUTH_URL: 'not-a-valid-url',
      };

      const result = validateEnvConfig(invalidUrlConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.includes('NEXTAUTH_URL'))).toBe(true);
      }
    });
  });
});

/**
 * tests/unit/lib/logger.test.ts
 *
 * Unit tests for the logging abstraction.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '@/lib/logger';

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

  it('creates child logger with bound context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const childLogger = logger.child({ correlationId: 'req-123' });
    childLogger.error('Child error');
    expect(spy).toHaveBeenCalled();
    const loggedStr = spy.mock.calls[0]?.[0] as string;
    expect(loggedStr).toContain('req-123');
  });
});

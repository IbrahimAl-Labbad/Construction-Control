/**
 * lib/logger/index.ts
 *
 * Logging abstraction for the application with centralized secret redaction.
 *
 * IMPORTANT: Never use console.log in application code.
 * Always use this logger module.
 *
 * Why?
 * - Provides consistent log format (structured JSON in production)
 * - Respects LOG_LEVEL from validated environment configuration
 * - Recursively redacts sensitive fields (passwords, tokens, secrets)
 * - Supports request correlation IDs
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('User authenticated', { userId: user.id, role: user.role });
 *   logger.error('Database error', { error: err.message, query: 'user.findUnique' });
 */

import { env, isProduction } from '@/lib/config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogContext {
  /** Request correlation ID — set by middleware for traceability */
  correlationId?: string;
  /** User ID for audit trail */
  userId?: string;
  /** Additional structured context */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Level ordering
// ---------------------------------------------------------------------------

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// ---------------------------------------------------------------------------
// Sensitive key redaction
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_PATTERN =
  /^(password|passwordhash|token|secret|authorization|cookie|sessiontoken|creditcard|apikey|accesstoken|refreshtoken)$/i;

/**
 * Recursively traverses and redacts sensitive keys in log payloads.
 */
export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof value === 'object') {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: isProduction ? undefined : value.stack,
        cause: value.cause ? redactSensitiveData(value.cause, depth + 1) : undefined,
      };
    }

    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        cleaned[k] = '[REDACTED]';
      } else {
        cleaned[k] = redactSensitiveData(v, depth + 1);
      }
    }
    return cleaned;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Logger implementation
// ---------------------------------------------------------------------------

function getConfiguredLevel(): LogLevel {
  return env.LOG_LEVEL as LogLevel;
}

function shouldLog(level: LogLevel): boolean {
  const configuredLevel = getConfiguredLevel();
  return LOG_LEVEL_ORDER[level] <= LOG_LEVEL_ORDER[configuredLevel];
}

function formatMessage(
  level: LogLevel,
  message: string,
  context?: LogContext,
): string {
  const timestamp = new Date().toISOString();
  const sanitizedContext = context
    ? (redactSensitiveData(context) as LogContext)
    : undefined;

  if (isProduction) {
    // Structured JSON for log aggregators
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...sanitizedContext,
    });
  }

  // Human-readable format for development
  const contextStr = sanitizedContext
    ? ` ${JSON.stringify(sanitizedContext)}`
    : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

// ---------------------------------------------------------------------------
// Logger interface
// ---------------------------------------------------------------------------

export interface Logger {
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  /** Create a child logger with pre-set context */
  child(defaultContext: LogContext): Logger;
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

function createLogger(defaultContext?: LogContext): Logger {
  function log(level: LogLevel, message: string, context?: LogContext): void {
    if (!shouldLog(level)) return;

    const mergedContext = { ...defaultContext, ...context };
    const hasContext = Object.keys(mergedContext).length > 0;
    const formatted = formatMessage(
      level,
      message,
      hasContext ? mergedContext : undefined,
    );

    // Only place in the codebase where console methods are called.
    // ESLint's no-console rule is intentionally scoped to exclude this file.
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  return {
    error: (message, context) => log('error', message, context),
    warn: (message, context) => log('warn', message, context),
    info: (message, context) => log('info', message, context),
    debug: (message, context) => log('debug', message, context),
    child: (childContext) =>
      createLogger({ ...defaultContext, ...childContext }),
  };
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/**
 * The application-wide logger instance.
 */
export const logger = createLogger();

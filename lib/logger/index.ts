/**
 * lib/logger/index.ts
 *
 * Logging abstraction for the application.
 *
 * IMPORTANT: Never use console.log in application code.
 * Always use this logger module.
 *
 * Why?
 * - Provides consistent log format (structured JSON in production)
 * - Respects LOG_LEVEL environment variable
 * - Allows future integration with log aggregators (Datadog, CloudWatch, etc.)
 * - Supports request correlation IDs
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('User authenticated', { userId: user.id, role: user.role });
 *   logger.error('Database error', { error: err.message, query: 'user.findUnique' });
 *
 * Log levels (in order of severity):
 *   error > warn > info > debug
 *
 * In production, only error and warn are logged by default (LOG_LEVEL=info).
 * In development, all levels are logged.
 */

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
// Logger implementation
// ---------------------------------------------------------------------------

function getConfiguredLevel(): LogLevel {
  const level = process.env['LOG_LEVEL'];
  if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') {
    return level;
  }
  return process.env['NODE_ENV'] === 'production' ? 'warn' : 'debug';
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

  if (process.env['NODE_ENV'] === 'production') {
    // Structured JSON for log aggregators
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...context,
    });
  }

  // Human-readable format for development
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
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
    const formatted = formatMessage(
      level,
      message,
      Object.keys(mergedContext).length > 0 ? mergedContext : undefined,
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
 *
 * @example
 * import { logger } from '@/lib/logger';
 * logger.info('Server started');
 * logger.error('Unexpected error', { error: err.message, userId });
 */
export const logger = createLogger();

/**
 * lib/config/env.ts
 *
 * Typed environment variable validation.
 *
 * IMPORTANT: This module is the ONLY place where process.env is accessed.
 * All other modules must import from here. Never use process.env directly
 * in application code.
 *
 * This module validates all required environment variables at import time.
 * If a required variable is missing or malformed, the application will
 * throw an error and refuse to start.
 *
 * Usage:
 *   import { env } from '@/lib/config/env';
 *   const url = env.DATABASE_URL;
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // NextAuth
  NEXTAUTH_SECRET: z
    .string()
    .min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),

  // Logging
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug'])
    .default('info'),
});

// ---------------------------------------------------------------------------
// Type export
// ---------------------------------------------------------------------------

export type Env = z.infer<typeof envSchema>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates and returns all environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 *
 * Called once at module load time — the error message is printed during
 * application startup, making misconfiguration immediately obvious.
 */
function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `\n\n❌ Environment variable validation failed:\n${formatted}\n\n` +
        `Copy .env.example to .env.local and fill in all required values.\n`,
    );
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/**
 * Validated, typed environment variables.
 *
 * Access environment variables through this object instead of process.env.
 *
 * @example
 * import { env } from '@/lib/config/env';
 * const dbUrl = env.DATABASE_URL;
 */
export const env = validateEnv();

/**
 * Whether the application is running in production mode.
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Whether the application is running in development mode.
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Whether the application is running in test mode.
 */
export const isTest = env.NODE_ENV === 'test';

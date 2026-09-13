/**
 * lib/db/prisma.ts
 *
 * Singleton Prisma Client instance.
 *
 * IMPORTANT: This is the ONLY place PrismaClient is instantiated.
 * All other modules must import `prisma` from here.
 * Never call `new PrismaClient()` anywhere else in the codebase.
 *
 * Why singleton?
 * - In production: Prevents connection pool exhaustion.
 * - In development: Next.js hot reload would create a new PrismaClient on
 *   every change, exhausting PostgreSQL connections quickly.
 *   The global variable trick ensures a single instance survives hot reloads.
 *
 * Usage:
 *   import { prisma } from '@/lib/db/prisma';
 *   const users = await prisma.user.findMany();
 *
 * See AGENTS.md §11 for database conventions.
 */

import { PrismaClient } from '@prisma/client';

import { isDevelopment } from '@/lib/config/env';

// ---------------------------------------------------------------------------
// Type augmentation for the global singleton
// ---------------------------------------------------------------------------

declare global {
  // Allow reuse across hot reloads in development
  var __prisma: PrismaClient | undefined;
}

// ---------------------------------------------------------------------------
// Client creation
// ---------------------------------------------------------------------------

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: isDevelopment
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ]
      : [
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ],
  });
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/**
 * The application-wide Prisma Client instance.
 *
 * In development: reuses the global instance across hot reloads.
 * In production: creates a single instance per process.
 */
export const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

if (isDevelopment) {
  globalThis.__prisma = prisma;
}

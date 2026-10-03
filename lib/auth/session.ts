/**
 * lib/auth/session.ts
 *
 * Server-side session helpers enforcing Option C (Database-backed verification).
 *
 * These helpers are for SERVER-SIDE CODE ONLY (Server Components, API Routes,
 * Server Actions). Never use these in client components.
 *
 * For client-side session display (not authorization), use next-auth's
 * useSession() hook from next-auth/react.
 *
 * See AGENTS.md §17 for authentication rules.
 * See AGENTS.md §18 for authorization rules.
 */

import { getServerSession as nextAuthGetServerSession } from 'next-auth';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db/prisma';

import { authOptions } from './config';
import type { AuthenticatedUser } from './types';

// ---------------------------------------------------------------------------
// Session retrieval
// ---------------------------------------------------------------------------

/**
 * Gets the current server-side session.
 *
 * Returns null if the user is not authenticated.
 * Does NOT throw on unauthenticated requests.
 */
export async function getSession() {
  return nextAuthGetServerSession(authOptions);
}

/**
 * Gets the current authenticated user without throwing.
 * Returns the user object if authenticated, null otherwise.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

// ---------------------------------------------------------------------------
// Authentication guards
// ---------------------------------------------------------------------------

/**
 * Requires the user to be authenticated and verified against the database.
 *
 * Enforces Option C:
 * 1. Checks NextAuth session presence.
 * 2. Checks active session token presence.
 * 3. Verifies against the PostgreSQL Session table in real time.
 * 4. Verifies that the user is not disabled or soft-deleted.
 *
 * @throws {AuthError} if not authenticated, expired, revoked, or inactive
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const session = await getSession();

  if (!session?.user?.id || !session.user.sessionToken) {
    logger.warn('auth.missing_session');
    throw new AuthError('UNAUTHENTICATED');
  }

  // Real-time verification against PostgreSQL Session table
  const dbSession = await prisma.session.findUnique({
    where: { sessionToken: session.user.sessionToken },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });

  // Session revoked or expired
  if (!dbSession || dbSession.expires < new Date()) {
    logger.warn('auth.session_expired_or_revoked', { userId: session.user.id });
    throw new AuthError('UNAUTHENTICATED');
  }

  // Account deactivated or soft-deleted
  if (!dbSession.user.isActive || dbSession.user.deletedAt !== null) {
    logger.warn('auth.inactive_user', { userId: dbSession.user.id });
    throw new AuthError('ACCOUNT_INACTIVE');
  }

  return {
    id: dbSession.user.id,
    name: dbSession.user.name,
    email: dbSession.user.email,
    image: dbSession.user.image,
    role: dbSession.user.role,
    isActive: dbSession.user.isActive,
    sessionToken: dbSession.sessionToken,
  };
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Authentication error codes.
 */
export type AuthErrorCode = 'UNAUTHENTICATED' | 'ACCOUNT_INACTIVE';

/**
 * Thrown when authentication requirements are not met.
 */
export class AuthError extends Error {
  public readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
    this.code = code;
  }
}

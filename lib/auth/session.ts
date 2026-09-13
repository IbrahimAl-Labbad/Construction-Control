/**
 * lib/auth/session.ts
 *
 * Server-side session helpers.
 *
 * These helpers are for SERVER-SIDE CODE ONLY (Server Components, API Routes,
 * Server Actions). Never use these in client components.
 *
 * For client-side session display (not authorization), use next-auth's
 * useSession() hook from next-auth/react.
 *
 * See AGENTS.md §13 for authentication rules.
 * See AGENTS.md §14 for authorization rules.
 */

import { getServerSession as nextAuthGetServerSession } from 'next-auth';

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
 *
 * Use this when you need to check authentication state without
 * forcing a redirect. For protected routes, use requireAuth() instead.
 *
 * @example
 * const session = await getSession();
 * if (!session) redirect('/login');
 */
export async function getSession() {
  return nextAuthGetServerSession(authOptions);
}

/**
 * Gets the current authenticated user.
 *
 * Returns the user object if authenticated, null otherwise.
 * Does NOT throw on unauthenticated requests.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

// ---------------------------------------------------------------------------
// Authentication guards
// ---------------------------------------------------------------------------

/**
 * Requires the user to be authenticated.
 *
 * Throws an AuthError if the user is not authenticated or is inactive.
 * Use this in Server Components, API Routes, and Server Actions that
 * require any authenticated user.
 *
 * For role-specific guards, use requireRole() from lib/permissions/.
 *
 * @throws {AuthError} if not authenticated
 *
 * @example
 * // In a Server Component
 * const user = await requireAuth();
 * // user.role, user.id, user.isActive are available
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const session = await getSession();

  if (!session?.user) {
    throw new AuthError('UNAUTHENTICATED');
  }

  if (!session.user.isActive) {
    throw new AuthError('ACCOUNT_INACTIVE');
  }

  return session.user;
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
 *
 * Caught by:
 * - API route handlers → 401 response
 * - Server Actions → error response
 * - Middleware → redirect to /login
 */
export class AuthError extends Error {
  public readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
    this.code = code;
  }
}

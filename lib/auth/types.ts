/**
 * lib/auth/types.ts
 *
 * Typed user and session types for the authentication layer.
 *
 * These types extend NextAuth's default types to include role
 * and isActive status, which are required for authorization.
 *
 * Usage:
 *   import type { AuthenticatedUser, AuthenticatedSession } from '@/lib/auth/types';
 */

import type { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// Module augmentation for NextAuth
// ---------------------------------------------------------------------------

// Extend NextAuth's built-in types to include our custom fields.
// This ensures that `session.user` is always typed correctly throughout the app.
declare module 'next-auth' {
  interface Session {
    user: AuthenticatedUser;
  }
}

// ---------------------------------------------------------------------------
// User types
// ---------------------------------------------------------------------------

/**
 * The user object attached to every authenticated session.
 *
 * Always available after successful authentication.
 * Contains the minimum information needed for authorization decisions.
 */
export interface AuthenticatedUser {
  /** Unique user ID (cuid) */
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  /** The user's role — determines what they can see and do */
  role: Role;
  /** Inactive users are blocked at session creation */
  isActive: boolean;
}

/**
 * Typed session that includes the authenticated user.
 */
export interface AuthenticatedSession {
  user: AuthenticatedUser;
  expires: string;
}

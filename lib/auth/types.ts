/**
 * lib/auth/types.ts
 *
 * Typed user and session types for the authentication layer.
 * Compatible with exactOptionalPropertyTypes.
 */

import type { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// Module augmentation for NextAuth
// ---------------------------------------------------------------------------

declare module 'next-auth' {
  interface Session {
    user: AuthenticatedUser;
  }

  interface User {
    id: string;
    name?: string | null | undefined;
    email?: string | null | undefined;
    image?: string | null | undefined;
    role: Role;
    isActive: boolean;
    sessionToken?: string | undefined;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string | undefined;
    role?: Role | undefined;
    sessionToken?: string | undefined;
  }
}

// ---------------------------------------------------------------------------
// User types
// ---------------------------------------------------------------------------

/**
 * The user object attached to every authenticated session.
 * Always available after successful authentication.
 */
export interface AuthenticatedUser {
  /** Unique user ID (cuid) */
  id: string;
  name?: string | null | undefined;
  email?: string | null | undefined;
  image?: string | null | undefined;
  /** The user's role — determines what they can see and do */
  role: Role;
  /** Inactive users are blocked at session creation */
  isActive: boolean;
  /** Associated database session token for real-time validation */
  sessionToken?: string | undefined;
}

/**
 * Typed session that includes the authenticated user.
 */
export interface AuthenticatedSession {
  user: AuthenticatedUser;
  expires: string;
}

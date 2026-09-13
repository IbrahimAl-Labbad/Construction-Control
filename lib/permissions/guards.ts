/**
 * lib/permissions/guards.ts
 *
 * Server-side authorization guards.
 *
 * These functions enforce role-based access control on the SERVER.
 * They must be called at the start of every protected server action,
 * API route handler, or Server Component.
 *
 * NEVER rely on client-side checks for access control.
 * See AGENTS.md §6 for authorization principles.
 * See AGENTS.md §14 for authorization rules.
 *
 * Usage:
 *   // In a Server Component or Server Action
 *   const user = await requireRole(Role.MANAGER);
 *
 *   // In an API route
 *   try {
 *     const user = await requireRole([Role.MANAGER, Role.ACCOUNTANT]);
 *   } catch (error) {
 *     if (error instanceof PermissionError) {
 *       return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
 *     }
 *   }
 */

import { Role } from '@prisma/client';

import { requireAuth, type AuthError } from '@/lib/auth/session';
import type { AuthenticatedUser } from '@/lib/auth/types';

// Re-export AuthError so callers only need one import
export type { AuthError };

// ---------------------------------------------------------------------------
// Permission error
// ---------------------------------------------------------------------------

/**
 * Permission error codes.
 */
export type PermissionErrorCode = 'FORBIDDEN' | 'INSUFFICIENT_ROLE';

/**
 * Thrown when an authenticated user lacks the required permissions.
 *
 * Caught by:
 * - API route handlers → 403 response
 * - Server Actions → error response
 */
export class PermissionError extends Error {
  public readonly code: PermissionErrorCode;
  public readonly requiredRoles: Role[];
  public readonly actualRole: Role;

  constructor(
    code: PermissionErrorCode,
    requiredRoles: Role[],
    actualRole: Role,
  ) {
    super(code);
    this.name = 'PermissionError';
    this.code = code;
    this.requiredRoles = requiredRoles;
    this.actualRole = actualRole;
  }
}

// ---------------------------------------------------------------------------
// Role guards
// ---------------------------------------------------------------------------

/**
 * Requires the current user to have one of the specified roles.
 *
 * Also verifies authentication and active status (calls requireAuth internally).
 *
 * @param role - A single role or array of acceptable roles
 * @returns The authenticated user with verified role
 * @throws {AuthError} if not authenticated or inactive
 * @throws {PermissionError} if authenticated but wrong role
 *
 * @example
 * // Only manager can access
 * const user = await requireRole(Role.MANAGER);
 *
 * // Manager or accountant can access
 * const user = await requireRole([Role.MANAGER, Role.ACCOUNTANT]);
 */
export async function requireRole(
  role: Role | Role[],
): Promise<AuthenticatedUser> {
  const user = await requireAuth();

  const allowedRoles = Array.isArray(role) ? role : [role];

  if (!allowedRoles.includes(user.role)) {
    throw new PermissionError('INSUFFICIENT_ROLE', allowedRoles, user.role);
  }

  return user;
}

/**
 * Checks whether the current user has one of the specified roles.
 *
 * Does NOT throw — returns false if unauthenticated or wrong role.
 * Use this for conditional UI rendering (not as the sole access control).
 *
 * IMPORTANT: This is a server-side check. For client-side conditional
 * rendering, pass the result as a prop from a Server Component.
 *
 * @example
 * const canApprove = await hasRole([Role.MANAGER]);
 * if (canApprove) { ... }
 */
export async function hasRole(role: Role | Role[]): Promise<boolean> {
  try {
    await requireRole(role);
    return true;
  } catch {
    return false;
  }
}

/**
 * Requires the current user to be a Manager.
 * Convenience wrapper around requireRole(Role.MANAGER).
 */
export async function requireManager(): Promise<AuthenticatedUser> {
  return requireRole(Role.MANAGER);
}

/**
 * Requires the current user to be a Site Engineer.
 */
export async function requireEngineer(): Promise<AuthenticatedUser> {
  return requireRole(Role.ENGINEER);
}

/**
 * Requires the current user to be an Accountant.
 */
export async function requireAccountant(): Promise<AuthenticatedUser> {
  return requireRole(Role.ACCOUNTANT);
}

/**
 * Requires the current user to be a Purchasing Officer.
 */
export async function requirePurchasing(): Promise<AuthenticatedUser> {
  return requireRole(Role.PURCHASING);
}

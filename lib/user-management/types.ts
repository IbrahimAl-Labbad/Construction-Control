/**
 * lib/user-management/types.ts
 *
 * Domain types for the user management module.
 *
 * SECURITY: Types in this file represent data safe for serialization
 * to the presentation layer. They must never include:
 * - passwordHash (credential data)
 * - sessionToken (session data)
 * - deletedAt (soft-deletion is an infrastructure concern)
 * - any internal credential fields
 *
 * See AGENTS.md §17 for data exposure rules.
 */

import type { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// Safe user summary
// ---------------------------------------------------------------------------

/**
 * A safe, serializable representation of a user.
 * Returned by all user management use cases.
 *
 * This is the ONLY user representation that may cross the server→client
 * boundary. Never return Prisma User objects directly.
 */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

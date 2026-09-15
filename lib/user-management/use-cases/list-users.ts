/**
 * lib/user-management/use-cases/list-users.ts
 *
 * Use case: List all non-soft-deleted users.
 *
 * Authorization: MANAGER only (enforced in this use case).
 * Exclusion: Users with deletedAt != null are excluded.
 * Returns: Safe UserSummary objects — no passwordHash, no session data.
 *
 * See AGENTS.md §18 for authorization rules.
 */

import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';

import type { UserSummary } from '../types';

/**
 * Returns all non-soft-deleted users, sorted newest first.
 *
 * @throws {AuthError} if not authenticated
 * @throws {PermissionError} if authenticated user is not a Manager
 */
export async function listUsers(): Promise<UserSummary[]> {
  // Authorization — MANAGER only
  await requireManager();

  return prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

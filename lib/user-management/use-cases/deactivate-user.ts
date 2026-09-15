/**
 * lib/user-management/use-cases/deactivate-user.ts
 *
 * Use case: Manager deactivates a user account.
 *
 * Authorization: MANAGER only (enforced in this use case).
 * Safety:
 *   - Manager CANNOT deactivate their own account (enforced here).
 *   - Soft-deleted users (deletedAt != null) are treated as NOT_FOUND.
 *   - Deactivating an already-inactive user is idempotent (returns current state).
 * Transaction: isActive update + AuditLog written atomically.
 * Session invalidation: The existing requireAuth() real-time DB verification
 *   (Option C) will reject the deactivated user on their next request.
 *
 * See AGENTS.md §7 for use case rules.
 * See AGENTS.md §18 for authorization rules.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { userIdSchema } from '@/lib/validation/schemas/user';

import type { UserSummary } from '../types';

/**
 * Deactivates a user account (sets isActive = false).
 *
 * The manager cannot deactivate their own account.
 * Soft-deleted users are not accessible through this use case.
 * Operation is idempotent — deactivating an already-inactive user is safe.
 *
 * @param rawTargetUserId - The ID of the user to deactivate (validated internally)
 * @returns The updated user as a safe UserSummary
 * @throws {AuthError} if not authenticated
 * @throws {PermissionError} if not a Manager
 * @throws {ValidationError} if targetUserId fails validation
 * @throws {AppError} FORBIDDEN if the manager attempts self-deactivation
 * @throws {AppError} NOT_FOUND if the target user does not exist or is soft-deleted
 */
export async function deactivateUser(rawTargetUserId: unknown): Promise<UserSummary> {
  // 1. Authorization — MANAGER only (defense-in-depth)
  const actor = await requireManager();

  // 2. Validate target user ID
  const validation = validate(userIdSchema, rawTargetUserId);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }

  const targetUserId = validation.data;

  // 3. Self-deactivation guard — enforced at use case level, not only UI
  if (actor.id === targetUserId) {
    throw new AppError('FORBIDDEN', 'لا يمكنك تعطيل حسابك الخاص');
  }

  // 4. Fetch target user — exclude soft-deleted
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
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

  if (!target) {
    throw new AppError('NOT_FOUND', 'المستخدم غير موجود');
  }

  // 5. Idempotent — already inactive, return current state without writing
  if (!target.isActive) {
    return target;
  }

  // 6. Deactivate + audit in a single transaction
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
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

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'USER_DEACTIVATED',
        entityType: 'USER',
        entityId: user.id,
        metadata: {
          targetName: user.name,
          targetEmail: user.email,
        },
      },
    });

    return user;
  });

  return updated;
}

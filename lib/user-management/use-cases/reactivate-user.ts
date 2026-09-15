/**
 * lib/user-management/use-cases/reactivate-user.ts
 *
 * Use case: Manager reactivates a previously deactivated user account.
 *
 * Authorization: MANAGER only (enforced in this use case).
 * Safety:
 *   - Only reactivates users where: deletedAt == null AND isActive == false.
 *   - Soft-deleted users (deletedAt != null) are treated as NOT_FOUND.
 *   - Reactivating an already-active user is idempotent.
 * Transaction: isActive update + AuditLog written atomically.
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
 * Reactivates a user account (sets isActive = true).
 *
 * Only operates on users that are:
 *   - Not soft-deleted (deletedAt == null)
 *   - Deactivated (isActive == false)
 *
 * Reactivating an already-active user is idempotent and safe.
 *
 * @param rawTargetUserId - The ID of the user to reactivate (validated internally)
 * @returns The updated user as a safe UserSummary
 * @throws {AuthError} if not authenticated
 * @throws {PermissionError} if not a Manager
 * @throws {ValidationError} if targetUserId fails validation
 * @throws {AppError} NOT_FOUND if the target user does not exist or is soft-deleted
 */
export async function reactivateUser(rawTargetUserId: unknown): Promise<UserSummary> {
  // 1. Authorization — MANAGER only (defense-in-depth)
  const actor = await requireManager();

  // 2. Validate target user ID
  const validation = validate(userIdSchema, rawTargetUserId);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }

  const targetUserId = validation.data;

  // 3. Fetch target user — only non-soft-deleted users are eligible
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

  // 4. Idempotent — already active, return current state without writing
  if (target.isActive) {
    return target;
  }

  // 5. Reactivate + audit in a single transaction
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: { isActive: true },
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
        action: 'USER_REACTIVATED',
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

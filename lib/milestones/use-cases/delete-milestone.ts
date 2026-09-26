/**
 * lib/milestones/use-cases/delete-milestone.ts
 *
 * Use case: Manager soft-deletes a planned milestone.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (BD-12-01).
 * 2. Status constraint (BD-12-05): Allowed ONLY for status === PLANNED.
 *    Throws INVALID_STATE_TRANSITION for IN_PROGRESS, COMPLETED, CANCELLED.
 * 3. Parent Project Row Touch / Lock (BD-12-08, BD-12-09).
 * 4. Concurrency CAS updateMany: requires status === PLANNED and deletedAt === null.
 * 5. Sets deletedAt = new Date() and updatedById = actor.id.
 * 6. AuditLog entry MILESTONE_DELETED in SAME transaction.
 */

import { MilestoneStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { milestoneIdSchema } from '@/lib/validation/schemas/milestone';
import { lockProjectForMilestoneMutation } from './internal-lock';

export async function deleteMilestone(milestoneId: unknown): Promise<{ success: true }> {
  // 1. Authorization
  const actor = await requireManager();

  // 2. Validate ID
  const idValidation = validate(milestoneIdSchema, milestoneId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Atomic transaction
  await prisma.$transaction(async (tx) => {
    // 3.1 Fetch existing milestone
    const existing = await tx.projectMilestone.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المحطة غير موجودة');
    }

    // 3.2 BD-12-05: Soft delete allowed only for PLANNED status
    if (existing.status !== MilestoneStatus.PLANNED) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن حذف المحطة بعد بدء العمل بها أو اكتمالها أو إلغائها (الحالة الحالية: "${existing.status}")`,
      );
    }

    // 3.3 Lock parent project and verify status [PLANNED, ACTIVE]
    await lockProjectForMilestoneMutation(tx, existing.projectId);

    // 3.4 Concurrency CAS updateMany: soft delete
    const deleteResult = await tx.projectMilestone.updateMany({
      where: {
        id,
        status: MilestoneStatus.PLANNED,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        updatedById: actor.id,
      },
    });

    if (deleteResult.count === 0) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'تعذر حذف المحطة نظراً لتغير حالتها بشكل متزامن',
      );
    }

    // 3.5 Write MILESTONE_DELETED AuditLog
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MILESTONE_DELETED',
        entityType: 'PROJECT_MILESTONE',
        entityId: id,
        metadata: {
          projectId: existing.projectId,
          title: existing.title,
          orderIndex: existing.orderIndex,
        },
      },
    });
  });

  return { success: true };
}

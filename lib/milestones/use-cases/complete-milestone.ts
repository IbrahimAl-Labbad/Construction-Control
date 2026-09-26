/**
 * lib/milestones/use-cases/complete-milestone.ts
 *
 * Use case: Manager marks a milestone as COMPLETED.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (BD-12-01).
 * 2. Milestone must be in status PLANNED or IN_PROGRESS.
 * 3. Parent Project Row Touch / Lock (BD-12-08, BD-12-09).
 * 4. Concurrency CAS updateMany: requires status in [PLANNED, IN_PROGRESS].
 * 5. achievedAt set to server timestamp new Date() (BD-12-06, BD-12-16).
 * 6. AuditLog entry MILESTONE_COMPLETED in SAME transaction.
 */

import { MilestoneStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { milestoneIdSchema } from '@/lib/validation/schemas/milestone';
import { MILESTONE_INCLUDE, toProjectMilestoneDTO } from '../mappers';
import { assertCanTransitionMilestoneStatus } from '../state-machine';
import type { ProjectMilestoneDTO } from '../types';
import { lockProjectForMilestoneMutation } from './internal-lock';

export async function completeMilestone(milestoneId: unknown): Promise<ProjectMilestoneDTO> {
  // 1. Authorization
  const actor = await requireManager();

  // 2. Validate ID
  const idValidation = validate(milestoneIdSchema, milestoneId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Atomic transaction
  const updated = await prisma.$transaction(async (tx) => {
    // 3.1 Fetch existing milestone
    const existing = await tx.projectMilestone.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المحطة غير موجودة');
    }

    // 3.2 State machine guard
    assertCanTransitionMilestoneStatus(existing.status, MilestoneStatus.COMPLETED);

    // 3.3 Lock parent project and verify status [PLANNED, ACTIVE]
    await lockProjectForMilestoneMutation(tx, existing.projectId);

    // 3.4 Concurrency CAS updateMany with server completion timestamp
    const achievedAt = new Date();
    const updateResult = await tx.projectMilestone.updateMany({
      where: {
        id,
        status: {
          in: [MilestoneStatus.PLANNED, MilestoneStatus.IN_PROGRESS],
        },
        deletedAt: null,
      },
      data: {
        status: MilestoneStatus.COMPLETED,
        achievedAt,
        updatedById: actor.id,
      },
    });

    if (updateResult.count === 0) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'تعذر اعتماد إنجاز المحطة نظراً لتغير حالتها بشكل متزامن',
      );
    }

    // 3.5 Write MILESTONE_COMPLETED AuditLog
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MILESTONE_COMPLETED',
        entityType: 'PROJECT_MILESTONE',
        entityId: id,
        metadata: {
          projectId: existing.projectId,
          previousStatus: existing.status,
          newStatus: MilestoneStatus.COMPLETED,
          achievedAt: achievedAt.toISOString(),
        },
      },
    });

    // 3.6 Fetch updated entity
    const milestone = await tx.projectMilestone.findUniqueOrThrow({
      where: { id },
      include: MILESTONE_INCLUDE,
    });

    return milestone;
  });

  return toProjectMilestoneDTO(updated);
}

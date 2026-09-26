/**
 * lib/milestones/use-cases/start-milestone.ts
 *
 * Use case: Manager marks a milestone as IN_PROGRESS.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (BD-12-01).
 * 2. Milestone must be in status PLANNED.
 * 3. Parent Project Row Touch / Lock (BD-12-08, BD-12-09).
 * 4. Concurrency CAS updateMany: requires status === PLANNED.
 * 5. AuditLog entry MILESTONE_STARTED in SAME transaction.
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

export async function startMilestone(milestoneId: unknown): Promise<ProjectMilestoneDTO> {
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
    assertCanTransitionMilestoneStatus(existing.status, MilestoneStatus.IN_PROGRESS);

    // 3.3 Lock parent project and verify status [PLANNED, ACTIVE]
    await lockProjectForMilestoneMutation(tx, existing.projectId);

    // 3.4 Concurrency CAS updateMany
    const updateResult = await tx.projectMilestone.updateMany({
      where: {
        id,
        status: MilestoneStatus.PLANNED,
        deletedAt: null,
      },
      data: {
        status: MilestoneStatus.IN_PROGRESS,
        updatedById: actor.id,
      },
    });

    if (updateResult.count === 0) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'تعذر بدء تنفيذ المحطة نظراً لتغير حالتها بشكل متزامن',
      );
    }

    // 3.5 Write MILESTONE_STARTED AuditLog
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MILESTONE_STARTED',
        entityType: 'PROJECT_MILESTONE',
        entityId: id,
        metadata: {
          projectId: existing.projectId,
          previousStatus: existing.status,
          newStatus: MilestoneStatus.IN_PROGRESS,
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

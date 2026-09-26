/**
 * lib/milestones/use-cases/cancel-milestone.ts
 *
 * Use case: Manager cancels a milestone with a required reason.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (BD-12-01).
 * 2. Zod validation via cancelMilestoneSchema (cancellationReason required).
 * 3. Milestone must be in status PLANNED or IN_PROGRESS.
 * 4. Parent Project Row Touch / Lock (BD-12-08, BD-12-09).
 * 5. Concurrency CAS updateMany: requires status in [PLANNED, IN_PROGRESS].
 * 6. AuditLog entry MILESTONE_CANCELLED with reason in SAME transaction.
 * 7. No cancellationReason column on entity — preserved in AuditLog (Section 11).
 */

import { MilestoneStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  milestoneIdSchema,
  cancelMilestoneSchema,
} from '@/lib/validation/schemas/milestone';
import { MILESTONE_INCLUDE, toProjectMilestoneDTO } from '../mappers';
import { assertCanTransitionMilestoneStatus } from '../state-machine';
import type { ProjectMilestoneDTO } from '../types';
import { lockProjectForMilestoneMutation } from './internal-lock';

export async function cancelMilestone(
  milestoneId: unknown,
  rawInput: unknown,
): Promise<ProjectMilestoneDTO> {
  // 1. Authorization
  const actor = await requireManager();

  // 2. Validate milestoneId
  const idValidation = validate(milestoneIdSchema, milestoneId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Validate cancellation input
  const inputValidation = validate(cancelMilestoneSchema, rawInput);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const { cancellationReason } = inputValidation.data;

  // 4. Atomic transaction
  const updated = await prisma.$transaction(async (tx) => {
    // 4.1 Fetch existing milestone
    const existing = await tx.projectMilestone.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المحطة غير موجودة');
    }

    // 4.2 State machine guard
    assertCanTransitionMilestoneStatus(existing.status, MilestoneStatus.CANCELLED);

    // 4.3 Lock parent project and verify status [PLANNED, ACTIVE]
    await lockProjectForMilestoneMutation(tx, existing.projectId);

    // 4.4 Concurrency CAS updateMany
    const updateResult = await tx.projectMilestone.updateMany({
      where: {
        id,
        status: {
          in: [MilestoneStatus.PLANNED, MilestoneStatus.IN_PROGRESS],
        },
        deletedAt: null,
      },
      data: {
        status: MilestoneStatus.CANCELLED,
        updatedById: actor.id,
      },
    });

    if (updateResult.count === 0) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'تعذر إلغاء المحطة نظراً لتغير حالتها بشكل متزامن',
      );
    }

    // 4.5 Write MILESTONE_CANCELLED AuditLog
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MILESTONE_CANCELLED',
        entityType: 'PROJECT_MILESTONE',
        entityId: id,
        metadata: {
          projectId: existing.projectId,
          previousStatus: existing.status,
          newStatus: MilestoneStatus.CANCELLED,
          reason: cancellationReason,
        },
      },
    });

    // 4.6 Fetch updated entity
    const milestone = await tx.projectMilestone.findUniqueOrThrow({
      where: { id },
      include: MILESTONE_INCLUDE,
    });

    return milestone;
  });

  return toProjectMilestoneDTO(updated);
}

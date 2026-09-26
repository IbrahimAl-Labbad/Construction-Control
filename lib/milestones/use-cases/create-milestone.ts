/**
 * lib/milestones/use-cases/create-milestone.ts
 *
 * Use case: Manager creates a new milestone for a project.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (BD-12-01).
 * 2. Zod validation via createMilestoneSchema.
 * 3. Parent Project Row Touch / Lock (BD-12-08, BD-12-09):
 *    - Project must exist, deletedAt === null, status in [PLANNED, ACTIVE].
 * 4. Serialized next orderIndex computation within transaction.
 * 5. Milestone creation with status = PLANNED.
 * 6. AuditLog entry MILESTONE_CREATED written in SAME transaction.
 */

import { MilestoneStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { createMilestoneSchema } from '@/lib/validation/schemas/milestone';
import { formatMilestoneDateString, toCalendarDate } from '../calculations';
import { MILESTONE_INCLUDE, toProjectMilestoneDTO } from '../mappers';
import type { ProjectMilestoneDTO } from '../types';
import { lockProjectForMilestoneMutation } from './internal-lock';

export async function createMilestone(rawInput: unknown): Promise<ProjectMilestoneDTO> {
  // 1. Authorization — Manager only
  const actor = await requireManager();

  // 2. Validate input
  const validation = validate(createMilestoneSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const { projectId, title, description, targetDate } = validation.data;

  // 3. Atomic transaction execution
  const created = await prisma.$transaction(async (tx) => {
    // 3.1 Lock parent Project and verify status [PLANNED, ACTIVE]
    await lockProjectForMilestoneMutation(tx, projectId);

    // 3.2 Compute serialized next orderIndex while holding lock
    const maxAgg = await tx.projectMilestone.aggregate({
      where: { projectId, deletedAt: null },
      _max: { orderIndex: true },
    });
    const nextOrderIndex = (maxAgg._max.orderIndex ?? -1) + 1;

    // 3.3 Create the milestone
    const milestone = await tx.projectMilestone.create({
      data: {
        projectId,
        title,
        description: description ?? null,
        targetDate: toCalendarDate(targetDate),
        status: MilestoneStatus.PLANNED,
        orderIndex: nextOrderIndex,
        createdById: actor.id,
      },
      include: MILESTONE_INCLUDE,
    });

    // 3.4 Write MILESTONE_CREATED AuditLog in SAME transaction
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MILESTONE_CREATED',
        entityType: 'PROJECT_MILESTONE',
        entityId: milestone.id,
        metadata: {
          projectId: milestone.projectId,
          title: milestone.title,
          targetDate: formatMilestoneDateString(milestone.targetDate),
          orderIndex: milestone.orderIndex,
        },
      },
    });

    return milestone;
  });

  return toProjectMilestoneDTO(created);
}

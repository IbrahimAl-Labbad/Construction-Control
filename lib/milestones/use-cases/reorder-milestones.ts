/**
 * lib/milestones/use-cases/reorder-milestones.ts
 *
 * Use case: Manager reorders the sequence of milestones in a project.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (BD-12-01).
 * 2. Zod validation via reorderMilestonesSchema (distinct IDs required).
 * 3. Parent Project Row Touch / Lock (BD-12-08, BD-12-09).
 * 4. Exact match validation:
 *    - All milestone IDs must exist, belong to this project, and have deletedAt === null.
 *    - The list must contain all active milestones of the project without omissions.
 * 5. Sequential orderIndex assignment (0..n-1).
 * 6. AuditLog entry MILESTONE_REORDERED in SAME transaction.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { reorderMilestonesSchema } from '@/lib/validation/schemas/milestone';
import { MILESTONE_INCLUDE, toProjectMilestoneDTO } from '../mappers';
import type { ProjectMilestoneDTO } from '../types';
import { lockProjectForMilestoneMutation } from './internal-lock';

export async function reorderProjectMilestones(
  rawInput: unknown,
): Promise<ProjectMilestoneDTO[]> {
  // 1. Authorization
  const actor = await requireManager();

  // 2. Validate input
  const validation = validate(reorderMilestonesSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const { projectId, milestoneIds } = validation.data;

  // 3. Atomic transaction
  const updatedList = await prisma.$transaction(async (tx) => {
    // 3.1 Lock parent project and verify status [PLANNED, ACTIVE]
    await lockProjectForMilestoneMutation(tx, projectId);

    // 3.2 Fetch all active milestones for this project
    const activeMilestones = await tx.projectMilestone.findMany({
      where: {
        projectId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (activeMilestones.length !== milestoneIds.length) {
      throw new AppError(
        'VALIDATION_ERROR',
        'قائمة المحطات لإعادة الترتيب غير متطابقة مع محطات المشروع النشطة',
      );
    }

    const activeIdSet = new Set(activeMilestones.map((m) => m.id));
    for (const id of milestoneIds) {
      if (!activeIdSet.has(id)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'قائمة المحطات تحتوي على معرّف غير تابع لهذا المشروع أو محذوف',
        );
      }
    }

    // 3.3 Update orderIndex sequentially
    await Promise.all(
      milestoneIds.map((id, index) =>
        tx.projectMilestone.update({
          where: { id },
          data: {
            orderIndex: index,
            updatedById: actor.id,
          },
        }),
      ),
    );

    // 3.4 Write MILESTONE_REORDERED AuditLog
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MILESTONE_REORDERED',
        entityType: 'PROJECT',
        entityId: projectId,
        metadata: {
          reorderedMilestoneIds: milestoneIds,
          totalCount: milestoneIds.length,
        },
      },
    });

    // 3.5 Return refreshed ordered milestones
    const refreshed = await tx.projectMilestone.findMany({
      where: {
        projectId,
        deletedAt: null,
      },
      include: MILESTONE_INCLUDE,
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });

    return refreshed;
  });

  return updatedList.map((m) => toProjectMilestoneDTO(m));
}

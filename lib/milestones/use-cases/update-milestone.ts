/**
 * lib/milestones/use-cases/update-milestone.ts
 *
 * Use case: Manager updates milestone metadata (title, description, targetDate).
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (BD-12-01).
 * 2. Zod validation via updateMilestoneMetadataSchema.
 * 3. Milestone must exist, not deleted, and status in [PLANNED, IN_PROGRESS].
 * 4. Parent Project Row Touch / Lock (BD-12-08, BD-12-09).
 * 5. Computes delta — only changed fields are updated and logged.
 * 6. AuditLog entry MILESTONE_UPDATED written in SAME transaction.
 */

import { MilestoneStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  milestoneIdSchema,
  updateMilestoneMetadataSchema,
} from '@/lib/validation/schemas/milestone';
import { formatMilestoneDateString, toCalendarDate } from '../calculations';
import { MILESTONE_INCLUDE, toProjectMilestoneDTO } from '../mappers';
import type { ProjectMilestoneDTO } from '../types';
import { lockProjectForMilestoneMutation } from './internal-lock';

export async function updateMilestone(
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

  // 3. Validate input
  const inputValidation = validate(updateMilestoneMetadataSchema, rawInput);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const { title, description, targetDate, reason } = inputValidation.data;

  // 4. Atomic transaction
  const updated = await prisma.$transaction(async (tx) => {
    // 4.1 Fetch existing milestone
    const existing = await tx.projectMilestone.findFirst({
      where: { id, deletedAt: null },
      include: MILESTONE_INCLUDE,
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'المحطة غير موجودة');
    }

    if (
      existing.status !== MilestoneStatus.PLANNED &&
      existing.status !== MilestoneStatus.IN_PROGRESS
    ) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن تعديل بيانات محطة بحالة "${existing.status}". التعديل متاح فقط للمحطات قيد التخطيط أو قيد التنفيذ.`,
      );
    }

    // 4.2 Lock parent project and verify status [PLANNED, ACTIVE]
    await lockProjectForMilestoneMutation(tx, existing.projectId);

    // 4.3 Compute delta
    type DeltaRecord = Record<string, { previous: string | null; current: string | null }>;
    const delta: DeltaRecord = {};

    const updateData: {
      title?: string;
      description?: string | null;
      targetDate?: Date;
      updatedById: string;
    } = {
      updatedById: actor.id,
    };

    if (title !== undefined && title !== existing.title) {
      delta['title'] = { previous: existing.title, current: title };
      updateData.title = title;
    }

    const currentDesc = existing.description ?? null;
    const newDesc = description ?? null;
    if (description !== undefined && newDesc !== currentDesc) {
      delta['description'] = { previous: currentDesc, current: newDesc };
      updateData.description = newDesc;
    }

    if (targetDate !== undefined) {
      const existingDateStr = formatMilestoneDateString(existing.targetDate);
      const newDateStr = formatMilestoneDateString(targetDate);
      if (existingDateStr !== newDateStr) {
        delta['targetDate'] = { previous: existingDateStr, current: newDateStr };
        updateData.targetDate = toCalendarDate(targetDate);
      }
    }

    // 4.4 If nothing changed, return existing
    if (Object.keys(delta).length === 0) {
      return existing;
    }

    // 4.5 Update milestone
    const milestone = await tx.projectMilestone.update({
      where: { id },
      data: updateData,
      include: MILESTONE_INCLUDE,
    });

    // 4.6 Write MILESTONE_UPDATED AuditLog
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MILESTONE_UPDATED',
        entityType: 'PROJECT_MILESTONE',
        entityId: milestone.id,
        metadata: {
          projectId: milestone.projectId,
          changes: delta,
          ...(reason ? { reason } : {}),
        },
      },
    });

    return milestone;
  });

  return toProjectMilestoneDTO(updated);
}

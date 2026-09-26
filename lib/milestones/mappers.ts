/**
 * lib/milestones/mappers.ts
 *
 * Mappers for ProjectMilestone entity to client-safe DTOs.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * - targetDate serialized as YYYY-MM-DD string.
 * - achievedAt, createdAt, updatedAt serialized as ISO-8601 strings or null.
 * - No Date objects cross the server/client boundary.
 * - isOverdue derived dynamically based on businessToday.
 * - No soft-delete flags (deletedAt) leaked.
 * - No sensitive user details leaked (names only).
 */

import type { Prisma } from '@prisma/client';
import type { ProjectMilestoneDTO } from './types';
import {
  formatMilestoneDateString,
  isMilestoneOverdue,
  getBusinessTodayDateString,
} from './calculations';

export const MILESTONE_INCLUDE = {
  createdBy: {
    select: {
      id: true,
      name: true,
    },
  },
  updatedBy: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export type ProjectMilestoneWithRelations = Prisma.ProjectMilestoneGetPayload<{
  include: typeof MILESTONE_INCLUDE;
}>;

export function toProjectMilestoneDTO(
  entity: ProjectMilestoneWithRelations,
  businessToday: string = getBusinessTodayDateString(),
): ProjectMilestoneDTO {
  const targetDateStr = formatMilestoneDateString(entity.targetDate);
  const overdue = isMilestoneOverdue(targetDateStr, entity.status, businessToday);

  return {
    id: entity.id,
    projectId: entity.projectId,
    title: entity.title,
    description: entity.description ?? null,
    targetDate: targetDateStr,
    achievedAt: entity.achievedAt ? entity.achievedAt.toISOString() : null,
    status: entity.status,
    isOverdue: overdue,
    orderIndex: entity.orderIndex,
    createdById: entity.createdById,
    creatorName: entity.createdBy.name,
    updatedById: entity.updatedById ?? null,
    updaterName: entity.updatedBy?.name ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

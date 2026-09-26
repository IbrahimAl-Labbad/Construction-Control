/**
 * lib/milestones/queries/get-project-milestones.ts
 *
 * Query: Fetches all active (non-deleted) milestones for a project.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * - Role-based authorization & Engineer assignment check (BD-12-01 .. BD-12-04).
 * - Mandatory: project.deletedAt === null and milestone.deletedAt === null.
 * - Ordered by orderIndex ASC, createdAt ASC.
 * - Derives isOverdue dynamically based on businessToday (Asia/Riyadh).
 */

import { prisma } from '@/lib/db/prisma';
import { ValidationError } from '@/lib/errors';
import { validate } from '@/lib/validation';
import { projectIdSchema } from '@/lib/validation/schemas/milestone';
import { getBusinessTodayDateString } from '../calculations';
import { MILESTONE_INCLUDE, toProjectMilestoneDTO } from '../mappers';
import type { ProjectMilestoneDTO } from '../types';
import { assertCanViewProjectMilestones } from './query-auth';

export async function getProjectMilestones(
  projectIdInput: unknown,
): Promise<ProjectMilestoneDTO[]> {
  // 1. Validate projectId
  const idValidation = validate(projectIdSchema, projectIdInput);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const projectId = idValidation.data;

  // 2. Authorization & project active check
  await assertCanViewProjectMilestones(projectId);

  // 3. Current business calendar date in Riyadh
  const businessToday = getBusinessTodayDateString();

  // 4. Query active milestones
  const milestones = await prisma.projectMilestone.findMany({
    where: {
      projectId,
      deletedAt: null,
      project: {
        deletedAt: null,
      },
    },
    include: MILESTONE_INCLUDE,
    orderBy: [
      { orderIndex: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  return milestones.map((m) => toProjectMilestoneDTO(m, businessToday));
}

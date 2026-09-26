/**
 * lib/milestones/queries/get-project-milestone.ts
 *
 * Query: Fetches a single milestone by ID within a project.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * - IDOR Protection: Milestone must belong to the specified projectId.
 * - Mandatory: project.deletedAt === null and milestone.deletedAt === null.
 * - Role-based authorization & Engineer assignment check.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { validate } from '@/lib/validation';
import {
  milestoneIdSchema,
  projectIdSchema,
} from '@/lib/validation/schemas/milestone';
import { getBusinessTodayDateString } from '../calculations';
import { MILESTONE_INCLUDE, toProjectMilestoneDTO } from '../mappers';
import type { ProjectMilestoneDTO } from '../types';
import { assertCanViewProjectMilestones } from './query-auth';

export async function getProjectMilestone(
  projectIdInput: unknown,
  milestoneIdInput: unknown,
): Promise<ProjectMilestoneDTO> {
  // 1. Validate inputs
  const projectValidation = validate(projectIdSchema, projectIdInput);
  if (!projectValidation.success) {
    throw new ValidationError(projectValidation.errors);
  }
  const projectId = projectValidation.data;

  const milestoneValidation = validate(milestoneIdSchema, milestoneIdInput);
  if (!milestoneValidation.success) {
    throw new ValidationError(milestoneValidation.errors);
  }
  const milestoneId = milestoneValidation.data;

  // 2. Authorization & project active check
  await assertCanViewProjectMilestones(projectId);

  // 3. Current business calendar date
  const businessToday = getBusinessTodayDateString();

  // 4. Fetch milestone with IDOR guard
  const milestone = await prisma.projectMilestone.findFirst({
    where: {
      id: milestoneId,
      projectId,
      deletedAt: null,
      project: {
        deletedAt: null,
      },
    },
    include: MILESTONE_INCLUDE,
  });

  if (!milestone) {
    throw new AppError('NOT_FOUND', 'المحطة غير موجودة');
  }

  return toProjectMilestoneDTO(milestone, businessToday);
}

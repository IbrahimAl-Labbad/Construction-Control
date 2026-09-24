/**
 * lib/project-team/queries/get-assigned-projects-for-engineer.ts
 *
 * Query: Fetches active assigned projects for a Site Engineer.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 *
 * Enforces:
 * - Authorization: Role.MANAGER or the target Engineer themselves (BD-11-05).
 * - Target engineer must exist and not be soft-deleted.
 * - Inactive engineer accounts return empty array [].
 * - Queries only ACTIVE assignments.
 * - Excludes soft-deleted projects.
 * - By default (includeTerminal = false): returns open projects [PLANNED, ACTIVE, ON_HOLD].
 * - If includeTerminal = true: includes COMPLETED projects.
 * - CANCELLED projects are always excluded.
 * - Preserves Slice 10 compatibility (Slice 10 does not consume this query).
 */

import { AssignmentStatus, ProjectStatus, Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth, PermissionError } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { engineerIdSchema } from '@/lib/validation/schemas/project-team';
import { toAssignedProjectOptionDTO } from '../mappers';
import type { AssignedProjectOptionDTO } from '../types';

export interface GetAssignedProjectsOptions {
  includeTerminal?: boolean;
}

export async function getAssignedProjectsForEngineer(
  engineerId: unknown,
  options?: GetAssignedProjectsOptions,
): Promise<AssignedProjectOptionDTO[]> {
  const actor = await requireAuth();

  const idValidation = validate(engineerIdSchema, engineerId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const targetId = idValidation.data;

  // Authorization check
  if (actor.role !== Role.MANAGER && actor.id !== targetId) {
    throw new PermissionError('FORBIDDEN', [Role.MANAGER, Role.ENGINEER], actor.role);
  }

  // Verify target engineer
  const targetEngineer = await prisma.user.findFirst({
    where: { id: targetId, deletedAt: null },
    select: { id: true, isActive: true },
  });

  if (!targetEngineer) {
    throw new AppError('NOT_FOUND', 'المهندس غير موجود');
  }

  // Inactive engineers have no active operational assignments
  if (!targetEngineer.isActive) {
    return [];
  }

  const includeTerminal = options?.includeTerminal ?? false;
  const allowedProjectStatuses: ProjectStatus[] = includeTerminal
    ? [
        ProjectStatus.PLANNED,
        ProjectStatus.ACTIVE,
        ProjectStatus.ON_HOLD,
        ProjectStatus.COMPLETED,
      ]
    : [ProjectStatus.PLANNED, ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD];

  const assignments = await prisma.projectAssignment.findMany({
    where: {
      engineerId: targetId,
      status: AssignmentStatus.ACTIVE,
      project: {
        deletedAt: null,
        status: { in: allowedProjectStatuses },
      },
    },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      },
    },
    orderBy: {
      project: {
        name: 'asc',
      },
    },
  });

  return assignments.map(toAssignedProjectOptionDTO);
}

/**
 * lib/project-team/queries/get-project-team.ts
 *
 * Query: Fetches the team members (active and latest previous state) for a project.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 *
 * Enforces:
 * - Role.MANAGER only (requireManager()).
 * - Project must exist and not be soft-deleted.
 * - Excludes soft-deleted users (User.deletedAt != null).
 * - Includes deactivated users (marked with engineerIsActive: false).
 * - Returns ACTIVE members first, followed by INACTIVE members sorted by assignedAt desc.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { projectIdSchema } from '@/lib/validation/schemas/project-team';
import { toProjectTeamMemberDTO } from '../mappers';
import type { ProjectTeamMemberDTO } from '../types';

export async function getProjectTeam(projectId: unknown): Promise<ProjectTeamMemberDTO[]> {
  await requireManager();

  const idValidation = validate(projectIdSchema, projectId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  const assignments = await prisma.projectAssignment.findMany({
    where: {
      projectId: id,
      project: { deletedAt: null },
      engineer: { deletedAt: null }, // Excludes soft-deleted users (BD-11-10)
    },
    include: {
      engineer: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true, // Captures deactivation status (BD-11-10)
        },
      },
      assignedBy: {
        select: {
          name: true,
        },
      },
      removedBy: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      { status: 'asc' }, // ACTIVE ('ACTIVE' < 'INACTIVE') comes first
      { assignedAt: 'desc' },
    ],
  });

  return assignments.map(toProjectTeamMemberDTO);
}

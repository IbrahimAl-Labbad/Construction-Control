/**
 * lib/project-team/queries/get-active-project-engineer-count.ts
 *
 * Query: Returns the count of active Site Engineers assigned to a project.
 * Used by the project overview page (/projects/[projectId]) team widget.
 *
 * Enforces:
 * - Role.MANAGER only (requireManager()).
 * - Project must exist and not be soft-deleted.
 * - Counts only ACTIVE assignments.
 * - Counts only engineers where isActive === true and deletedAt === null.
 *
 * Executes a fast indexed count without loading full DTO relation graphs.
 */

import { AssignmentStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { projectIdSchema } from '@/lib/validation/schemas/project-team';

export async function getActiveProjectEngineerCount(
  projectId: unknown,
): Promise<number> {
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

  const count = await prisma.projectAssignment.count({
    where: {
      projectId: id,
      status: AssignmentStatus.ACTIVE,
      project: { deletedAt: null },
      engineer: { isActive: true, deletedAt: null },
    },
  });

  return count;
}

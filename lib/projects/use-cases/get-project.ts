/**
 * lib/projects/use-cases/get-project.ts
 *
 * Use case: Manager views details of a single project.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only.
 * 2. Validation: projectIdSchema.
 * 3. Soft-delete check: throws NOT_FOUND if deleted.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { projectIdSchema } from '@/lib/validation/schemas/project';

import type { ProjectDetails } from '../types';

/**
 * Returns details of a specific project by ID.
 *
 * @param projectId - The CUID of the project
 * @returns The project details
 * @throws {AuthError} if unauthenticated or inactive
 * @throws {PermissionError} if not a Manager
 * @throws {ValidationError} if projectId is invalid
 * @throws {AppError} NOT_FOUND if project does not exist or is deleted
 */
export async function getProject(projectId: unknown): Promise<ProjectDetails> {
  await requireManager();

  const validation = validate(projectIdSchema, projectId);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }

  const id = validation.data;

  const project = await prisma.project.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    include: {
      manager: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  return project;
}

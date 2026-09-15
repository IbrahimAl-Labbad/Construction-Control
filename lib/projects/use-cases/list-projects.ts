/**
 * lib/projects/use-cases/list-projects.ts
 *
 * Use case: Manager lists all non-deleted projects.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only.
 * 2. Soft-delete filter: deletedAt is null.
 * 3. Sorting: Ordered by creation date descending.
 */

import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';

import type { ProjectSummary } from '../types';

/**
 * Returns all active (non-deleted) projects.
 *
 * @returns Array of ProjectSummary
 * @throws {AuthError} if unauthenticated or inactive
 * @throws {PermissionError} if not a Manager
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  await requireManager();

  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
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

  return projects;
}

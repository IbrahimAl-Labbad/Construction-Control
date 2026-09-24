/**
 * lib/project-team/queries/is-engineer-assigned-to-project.ts
 *
 * Query helper: Relationship-level active assignment truth check.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 *
 * Checks whether an active, non-deleted Engineer holds an ACTIVE assignment
 * to a non-deleted, non-cancelled Project.
 *
 * Note: This helper verifies relationship-level truth only.
 * Future callers must combine this with relevant domain action policies.
 */

import { AssignmentStatus, ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export async function isEngineerAssignedToProject(
  projectId: string,
  engineerId: string,
): Promise<boolean> {
  if (!projectId || !engineerId) {
    return false;
  }

  const count = await prisma.projectAssignment.count({
    where: {
      projectId,
      engineerId,
      status: AssignmentStatus.ACTIVE,
      engineer: {
        isActive: true,
        deletedAt: null,
      },
      project: {
        deletedAt: null,
        status: {
          not: ProjectStatus.CANCELLED,
        },
      },
    },
  });

  return count > 0;
}

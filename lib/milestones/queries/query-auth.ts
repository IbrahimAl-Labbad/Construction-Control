/**
 * lib/milestones/queries/query-auth.ts
 *
 * Query Authorization and Project Existence verification helper.
 * Vertical Slice 12 — Project Planning & Milestones.
 *
 * Enforces:
 * - BD-12-01: Manager = ALLOW
 * - BD-12-02: Engineer = ALLOW ONLY IF active project assignment exists
 * - BD-12-03: Accountant = ALLOW
 * - BD-12-04: Purchasing = ALLOW
 * - Mandatory query correction: project.deletedAt must be null (never leak soft-deleted project).
 */

import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth, PermissionError } from '@/lib/permissions';
import { isEngineerAssignedToProject } from '@/lib/project-team';
import type { AuthenticatedUser } from '@/lib/auth/types';

export interface VerifiedProjectViewContext {
  actor: AuthenticatedUser;
  project: {
    id: string;
    code: string;
    name: string;
  };
}

export async function assertCanViewProjectMilestones(
  projectId: string,
): Promise<VerifiedProjectViewContext> {
  const actor = await requireAuth();

  // Mandatory check: project must exist and NOT be soft-deleted
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  // BD-12-01, BD-12-03, BD-12-04
  if (
    actor.role === Role.MANAGER ||
    actor.role === Role.ACCOUNTANT ||
    actor.role === Role.PURCHASING
  ) {
    return { actor, project };
  }

  // BD-12-02: Site Engineer must have an active assignment to the project
  if (actor.role === Role.ENGINEER) {
    const isAssigned = await isEngineerAssignedToProject(projectId, actor.id);
    if (!isAssigned) {
      throw new PermissionError(
        'FORBIDDEN',
        [Role.MANAGER, Role.ENGINEER],
        actor.role,
      );
    }
    return { actor, project };
  }

  throw new PermissionError('FORBIDDEN', [Role.MANAGER], actor.role);
}

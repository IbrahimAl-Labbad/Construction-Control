/**
 * lib/project-team/queries/get-active-engineers-for-assignment.ts
 *
 * Query: Fetches active engineers available to be assigned to a project.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 *
 * Enforces:
 * - Role.MANAGER only (requireManager()).
 * - Project must exist, not soft-deleted, and status in [PLANNED, ACTIVE, ON_HOLD].
 * - If project is COMPLETED or CANCELLED, throws INVALID_PROJECT_STATUS.
 * - Returns only active, non-deleted ENGINEER users.
 * - Excludes engineers who currently have an ACTIVE assignment on this project.
 * - Marks engineers who have an INACTIVE assignment as isReassignmentCandidate: true.
 */

import { AssignmentStatus, ProjectStatus, Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { projectIdSchema } from '@/lib/validation/schemas/project-team';
import type { AvailableEngineerOptionDTO } from '../types';

export async function getActiveEngineersForAssignment(
  projectId: unknown,
): Promise<AvailableEngineerOptionDTO[]> {
  await requireManager();

  const idValidation = validate(projectIdSchema, projectId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  if (
    project.status === ProjectStatus.COMPLETED ||
    project.status === ProjectStatus.CANCELLED
  ) {
    throw new AppError(
      'INVALID_PROJECT_STATUS',
      'المشروع مغلق أو ملغى ولا يقبل تعيينات جديدة',
    );
  }

  // 1. Fetch all active, non-deleted engineers
  const activeEngineers = await prisma.user.findMany({
    where: {
      role: Role.ENGINEER,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  // 2. Fetch existing assignments for this project
  const projectAssignments = await prisma.projectAssignment.findMany({
    where: {
      projectId: id,
    },
    select: {
      engineerId: true,
      status: true,
    },
  });

  const assignmentMap = new Map<string, AssignmentStatus>();
  for (const a of projectAssignments) {
    assignmentMap.set(a.engineerId, a.status);
  }

  // 3. Filter and construct DTOs
  const availableEngineers: AvailableEngineerOptionDTO[] = [];

  for (const eng of activeEngineers) {
    const status = assignmentMap.get(eng.id);
    if (status === AssignmentStatus.ACTIVE) {
      // Exclude currently active engineers
      continue;
    }

    availableEngineers.push({
      engineerId: eng.id,
      engineerName: eng.name,
      engineerEmail: eng.email,
      isReassignmentCandidate: status === AssignmentStatus.INACTIVE,
    });
  }

  return availableEngineers;
}

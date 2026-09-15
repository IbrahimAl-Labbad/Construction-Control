/**
 * lib/projects/use-cases/change-project-status.ts
 *
 * Use case: Manager changes the lifecycle status of a project.
 *
 * Status changes are ONLY allowed through this use case.
 * The general updateProject use case must NOT touch status.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only.
 * 2. Validation: changeProjectStatusSchema (newStatus + optional reason ≤500 chars).
 * 3. Project existence and soft-delete check.
 * 4. Strict state machine: assertCanTransitionProjectStatus.
 * 5. Atomicity: status update + PROJECT_STATUS_CHANGED AuditLog in SAME transaction.
 *
 * See AGENTS.md §8 (use cases) and §21 (audit requirements).
 * Transition matrix defined in lib/projects/state-machine.ts.
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  projectIdSchema,
  changeProjectStatusSchema,
} from '@/lib/validation/schemas/project';
import { assertCanTransitionProjectStatus } from '../state-machine';

import type { ProjectDetails } from '../types';

/**
 * Changes the lifecycle status of a project.
 *
 * @param projectId - CUID of the target project
 * @param rawInput  - { newStatus, reason? }
 * @returns Updated project details
 * @throws {AuthError} if unauthenticated or inactive
 * @throws {PermissionError} if not a Manager
 * @throws {ValidationError} if input fails schema validation
 * @throws {AppError} NOT_FOUND if project does not exist or is soft-deleted
 * @throws {AppError} INVALID_STATE_TRANSITION if transition is not permitted
 */
export async function changeProjectStatus(
  projectId: unknown,
  rawInput: unknown,
): Promise<ProjectDetails> {
  // 1. Authorization
  const actor = await requireManager();

  // 2. Validate project ID
  const idValidation = validate(projectIdSchema, projectId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Validate input
  const inputValidation = validate(changeProjectStatusSchema, rawInput);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const { newStatus, reason } = inputValidation.data;

  // 4. Fetch existing project
  const existing = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      manager: { select: { id: true, name: true, email: true } },
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  // 5. Enforce state machine — throws INVALID_STATE_TRANSITION if not allowed
  assertCanTransitionProjectStatus(existing.status, newStatus);

  // 6. Atomic transaction: update status + audit
  const updated = await prisma.$transaction(async (tx) => {
    const project = await tx.project.update({
      where: { id },
      data: { status: newStatus },
      include: {
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROJECT_STATUS_CHANGED',
        entityType: 'PROJECT',
        entityId: project.id,
        metadata: {
          previousStatus: existing.status,
          newStatus,
          reason: reason ?? null,
        },
      },
    });

    return project;
  });

  return updated;
}

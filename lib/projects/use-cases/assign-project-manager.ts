/**
 * lib/projects/use-cases/assign-project-manager.ts
 *
 * Use case: Manager assigns (or re-assigns) the responsible manager for a project.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only.
 * 2. Validation: assignManagerSchema (newManagerId + optional reason ≤500 chars).
 * 3. Project existence and soft-delete check.
 * 4. Manager validity: new manager must exist, have Role.MANAGER, isActive=true, deletedAt=null.
 * 5. Self-assignment guard: rejects if new manager is already the current manager.
 * 6. Atomicity: managerId update + PROJECT_MANAGER_ASSIGNED AuditLog in SAME transaction.
 *
 * See AGENTS.md §8 (use cases) and §21 (audit requirements).
 */

import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  projectIdSchema,
  assignManagerSchema,
} from '@/lib/validation/schemas/project';

import type { ProjectDetails } from '../types';

/**
 * Assigns a new manager to a project.
 *
 * @param projectId - CUID of the target project
 * @param rawInput  - { newManagerId, reason? }
 * @returns Updated project details
 * @throws {AuthError} if unauthenticated or inactive
 * @throws {PermissionError} if not a Manager
 * @throws {ValidationError} if input fails schema validation
 * @throws {AppError} NOT_FOUND if project does not exist or is soft-deleted
 * @throws {AppError} INVALID_MANAGER if new manager is not valid
 * @throws {AppError} CONFLICT if new manager is the same as the current manager
 */
export async function assignProjectManager(
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
  const inputValidation = validate(assignManagerSchema, rawInput);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const { newManagerId, reason } = inputValidation.data;

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

  // 5. Guard: reject if new manager is already the current one
  if (existing.managerId === newManagerId) {
    throw new AppError('CONFLICT', 'هذا المدير هو المدير الحالي للمشروع بالفعل');
  }

  // 6. Verify new manager is active MANAGER user
  const targetManager = await prisma.user.findUnique({
    where: { id: newManagerId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (
    !targetManager ||
    targetManager.role !== Role.MANAGER ||
    !targetManager.isActive ||
    targetManager.deletedAt !== null
  ) {
    throw new AppError(
      'INVALID_MANAGER',
      'يجب إسناد المشروع إلى مدير نظام نشط ومصرح له',
    );
  }

  // 7. Atomic transaction: update managerId + audit
  const previousManagerId = existing.managerId;

  const updated = await prisma.$transaction(async (tx) => {
    const project = await tx.project.update({
      where: { id },
      data: { managerId: newManagerId },
      include: {
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROJECT_MANAGER_ASSIGNED',
        entityType: 'PROJECT',
        entityId: project.id,
        metadata: {
          previousManagerId,
          newManagerId,
          reason: reason ?? null,
        },
      },
    });

    return project;
  });

  return updated;
}

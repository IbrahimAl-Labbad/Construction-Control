/**
 * lib/projects/use-cases/create-project.ts
 *
 * Use case: Manager creates a new Project.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only (defense-in-depth).
 * 2. Validation: createProjectSchema (Zod).
 * 3. Business rule: Project.code uniqueness.
 * 4. Manager rule: managerId must reference an active MANAGER user (not soft-deleted).
 * 5. Atomicity: Project creation + PROJECT_CREATED AuditLog in the SAME transaction.
 *
 * See AGENTS.md §8 for use case rules.
 * See AGENTS.md §21 for audit requirements.
 */

import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { createProjectSchema } from '@/lib/validation/schemas/project';

import type { ProjectSummary } from '../types';

/**
 * Creates a new project in the system.
 *
 * @param rawInput - Raw input from client/form
 * @returns The created project as a ProjectSummary
 * @throws {AuthError} if unauthenticated or inactive
 * @throws {PermissionError} if not a Manager
 * @throws {ValidationError} if input fails schema validation
 * @throws {AppError} ALREADY_EXISTS if project code is already taken
 * @throws {AppError} INVALID_MANAGER if manager does not exist, is inactive, or not a MANAGER
 */
export async function createProject(rawInput: unknown): Promise<ProjectSummary> {
  // 1. Authorization — MANAGER only
  const actor = await requireManager();

  // 2. Validate input
  const validation = validate(createProjectSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }

  const { code, name, description, location, managerId, startDate, endDate } =
    validation.data;

  // 3. Verify project code uniqueness
  const existingProject = await prisma.project.findUnique({
    where: { code },
    select: { id: true },
  });

  if (existingProject) {
    throw new AppError('ALREADY_EXISTS', 'كود المشروع مستخدم بالفعل');
  }

  // 4. Verify target manager exists, role is MANAGER, isActive = true, deletedAt is null
  const targetManager = await prisma.user.findUnique({
    where: { id: managerId },
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

  // 5. Atomic transaction: Project + AuditLog
  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        code,
        name,
        description: description ?? null,
        location: location ?? null,
        managerId: targetManager.id,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
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

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROJECT_CREATED',
        entityType: 'PROJECT',
        entityId: project.id,
        metadata: {
          code: project.code,
          name: project.name,
          managerId: project.managerId,
          status: project.status,
          startDate: project.startDate ? project.startDate.toISOString() : null,
          endDate: project.endDate ? project.endDate.toISOString() : null,
        },
      },
    });

    return project;
  });

  return created;
}

/**
 * lib/projects/use-cases/update-project.ts
 *
 * Use case: Manager updates project metadata.
 *
 * Status is explicitly NOT updatable here — use changeProjectStatus instead.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only.
 * 2. Validation: updateProjectSchema (name, description, location, dates, reason).
 * 3. Project existence and soft-delete check.
 * 4. Delta calculation: only changed fields are written and audited.
 * 5. Atomicity: update + PROJECT_UPDATED AuditLog in the SAME transaction.
 * 6. No audit entry written if nothing changed.
 *
 * See AGENTS.md §8 (use cases) and §21 (audit requirements).
 */

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { updateProjectSchema, projectIdSchema } from '@/lib/validation/schemas/project';

import type { ProjectDetails } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Updates project metadata (name, description, location, dates).
 * Status cannot be changed via this function.
 *
 * @param projectId - CUID of the target project
 * @param rawInput  - Raw input from the form/client
 * @returns Updated project details
 * @throws {AuthError} if unauthenticated or inactive
 * @throws {PermissionError} if not a Manager
 * @throws {ValidationError} if input fails schema validation
 * @throws {AppError} NOT_FOUND if project does not exist or is soft-deleted
 */
export async function updateProject(
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
  const inputValidation = validate(updateProjectSchema, rawInput);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const { name, description, location, startDate, endDate, reason } =
    inputValidation.data;

  // 4. Fetch existing project from DB
  const existing = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      manager: { select: { id: true, name: true, email: true } },
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  // 5. Compute delta — only fields that actually changed
  type DeltaRecord = Record<string, { previous: string | null; current: string | null }>;
  const delta: DeltaRecord = {};

  if (existing.name !== name) {
    delta['name'] = { previous: existing.name, current: name };
  }

  const existingDescription = existing.description ?? null;
  const newDescription = description ?? null;
  if (existingDescription !== newDescription) {
    delta['description'] = { previous: existingDescription, current: newDescription };
  }

  const existingLocation = existing.location ?? null;
  const newLocation = location ?? null;
  if (existingLocation !== newLocation) {
    delta['location'] = { previous: existingLocation, current: newLocation };
  }

  const existingStartDate = isoOrNull(existing.startDate);
  const newStartDate = isoOrNull(startDate ?? null);
  if (existingStartDate !== newStartDate) {
    delta['startDate'] = { previous: existingStartDate, current: newStartDate };
  }

  const existingEndDate = isoOrNull(existing.endDate);
  const newEndDate = isoOrNull(endDate ?? null);
  if (existingEndDate !== newEndDate) {
    delta['endDate'] = { previous: existingEndDate, current: newEndDate };
  }

  // 6. If nothing changed, return existing record without writing to DB
  if (Object.keys(delta).length === 0) {
    return existing;
  }

  // 7. Atomic transaction: update + audit
  const updated = await prisma.$transaction(async (tx) => {
    const project = await tx.project.update({
      where: { id },
      data: {
        name,
        description: newDescription,
        location: newLocation,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
      },
      include: {
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROJECT_UPDATED',
        entityType: 'PROJECT',
        entityId: project.id,
        metadata: {
          changes: delta,
          reason: reason ?? null,
        },
      },
    });

    return project;
  });

  return updated;
}

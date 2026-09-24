/**
 * lib/project-team/use-cases/remove-engineer-from-project.ts
 *
 * Use case: Manager removes a Site Engineer from a Project.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (BD-11-02).
 * 2. Strict CUID & input validation via removeEngineerSchema.
 * 3. Parent Project Row Touch / CAS lock:
 *    - Touches Project.updatedAt within tx to acquire row-level lock.
 *    - Rejects if Project is COMPLETED or CANCELLED (BD-11-04, BD-11-12).
 * 4. Atomic CAS Removal:
 *    - updateMany where id = assignmentId, projectId = projectId, status = ACTIVE.
 *    - Requires count === 1.
 *    - If count === 0, diagnoses NOT_FOUND vs CONFLICT (already inactive).
 * 5. AuditLog invariant:
 *    - action: 'PROJECT_ENGINEER_REMOVED'
 *    - entityType: 'PROJECT'
 *    - entityId: projectId
 *    - metadata: { assignmentId, projectId, engineerId, engineerName, engineerEmail, reason }
 *    - Executed in the SAME prisma.$transaction.
 */

import { AssignmentStatus, ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { removeEngineerSchema } from '@/lib/validation/schemas/project-team';
import { toProjectTeamMemberDTO } from '../mappers';
import type { ProjectTeamMemberDTO } from '../types';

export async function removeEngineerFromProject(
  rawInput: unknown,
): Promise<ProjectTeamMemberDTO> {
  // 1. Authorization — Manager only
  const actor = await requireManager();

  // 2. Validate input schema
  const validation = validate(removeEngineerSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const { projectId, assignmentId, reason } = validation.data;

  // 3. Atomic transaction execution
  const assignmentDto = await prisma.$transaction(async (tx) => {
    // 3.1 Parent Project Row Touch / Lock
    // The parent Project row is intentionally touched during assignment mutation
    // because this write acquires the PostgreSQL parent-row lock required to
    // serialize team mutations against Project status transitions. This also
    // makes Project.updatedAt reflect modification of a project sub-resource.
    const projectTouch = await tx.project.updateMany({
      where: {
        id: projectId,
        status: {
          in: [ProjectStatus.PLANNED, ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD],
        },
        deletedAt: null,
      },
      data: {
        updatedAt: new Date(),
      },
    });

    if (projectTouch.count === 0) {
      const prj = await tx.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { status: true },
      });

      if (!prj) {
        throw new AppError('NOT_FOUND', 'المشروع غير موجود');
      }

      throw new AppError(
        'INVALID_PROJECT_STATUS',
        `لا يمكن تعديل فريق العمل لمشروع بحالة "${prj.status}". التعديل متاح فقط للمشاريع قيد التخطيط، النشطة، أو المعلقة.`,
      );
    }

    // 3.2 Atomic Compare-and-Set Removal
    const updateResult = await tx.projectAssignment.updateMany({
      where: {
        id: assignmentId,
        projectId,
        status: AssignmentStatus.ACTIVE,
      },
      data: {
        status: AssignmentStatus.INACTIVE,
        removedAt: new Date(),
        removedById: actor.id,
        removalReason: reason ?? null, // Optional, trimmed, max 500
      },
    });

    if (updateResult.count === 0) {
      const existing = await tx.projectAssignment.findFirst({
        where: { id: assignmentId, projectId },
        select: { status: true },
      });

      if (!existing) {
        throw new AppError('NOT_FOUND', 'سجل التعيين غير موجود في هذا المشروع');
      }

      if (existing.status === AssignmentStatus.INACTIVE) {
        throw new AppError(
          'CONFLICT',
          'تم إلغاء تعيين المهندس من المشروع مسبقاً بواسطة عملية متزامنة',
        );
      }

      throw new AppError('INVALID_STATE_TRANSITION', 'لا يمكن إلغاء التعيين في الحالة الحالية');
    }

    // 3.3 Fetch fresh updated record with relations
    const updatedRecord = await tx.projectAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: {
        engineer: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
          },
        },
        assignedBy: {
          select: {
            name: true,
          },
        },
        removedBy: {
          select: {
            name: true,
          },
        },
      },
    });

    // 3.4 Append-Only Audit Log
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROJECT_ENGINEER_REMOVED',
        entityType: 'PROJECT',
        entityId: projectId,
        metadata: {
          assignmentId,
          projectId,
          engineerId: updatedRecord.engineerId,
          engineerName: updatedRecord.engineer.name,
          engineerEmail: updatedRecord.engineer.email,
          reason: reason ?? null,
        },
      },
    });

    return toProjectTeamMemberDTO(updatedRecord);
  });

  return assignmentDto;
}

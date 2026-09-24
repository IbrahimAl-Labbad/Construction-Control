/**
 * lib/project-team/use-cases/assign-engineer-to-project.ts
 *
 * Use case: Manager assigns (or reactivates) a Site Engineer for a Project.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (BD-11-02).
 * 2. Strict CUID & input validation via assignEngineerSchema.
 * 3. Parent Project Row Touch / CAS lock:
 *    - Touches Project.updatedAt within tx to acquire row-level lock.
 *    - Rejects if Project is COMPLETED or CANCELLED (BD-11-04, BD-11-12).
 * 4. Target Engineer validation: must be active Role.ENGINEER and not soft-deleted.
 * 5. Lifecycle & Concurrency:
 *    - If no assignment exists: creates ProjectAssignment with status: ACTIVE.
 *      Catches P2002 on (projectId, engineerId) and maps to CONFLICT.
 *    - If existing status === ACTIVE: throws CONFLICT.
 *    - If existing status === INACTIVE: reactivates via atomic CAS updateMany (count === 1).
 *      Clears removedAt, removedById, removalReason on current entity.
 * 6. AuditLog invariant:
 *    - action: 'PROJECT_ENGINEER_ASSIGNED'
 *    - entityType: 'PROJECT'
 *    - entityId: projectId
 *    - metadata: { assignmentId, projectId, engineerId, engineerName, engineerEmail, isReactivation, reason }
 *    - Executed in the SAME prisma.$transaction.
 */

import { AssignmentStatus, ProjectStatus, Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { assignEngineerSchema } from '@/lib/validation/schemas/project-team';
import { isProjectAssignmentUniqueViolation, toProjectTeamMemberDTO } from '../mappers';
import type { ProjectTeamMemberDTO } from '../types';

export async function assignEngineerToProject(
  rawInput: unknown,
): Promise<ProjectTeamMemberDTO> {
  // 1. Authorization — Manager only
  const actor = await requireManager();

  // 2. Validate input schema
  const validation = validate(assignEngineerSchema, rawInput);
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }
  const { projectId, engineerId, reason } = validation.data;

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

    // 3.2 Target Engineer Invariants
    const targetEngineer = await tx.user.findFirst({
      where: { id: engineerId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!targetEngineer) {
      throw new AppError('NOT_FOUND', 'المهندس غير موجود');
    }

    if (targetEngineer.role !== Role.ENGINEER) {
      throw new AppError('INVALID_ENGINEER', 'المستخدم المحدد ليس مهندس موقع');
    }

    if (!targetEngineer.isActive) {
      throw new AppError('INVALID_ENGINEER', 'حساب المهندس غير نشط ولا يمكن تعيينه');
    }

    // 3.3 Check Existing Assignment
    const existing = await tx.projectAssignment.findUnique({
      where: {
        projectId_engineerId: {
          projectId,
          engineerId,
        },
      },
    });

    let assignmentId: string;
    let isReactivation = false;

    if (existing) {
      if (existing.status === AssignmentStatus.ACTIVE) {
        throw new AppError('CONFLICT', 'المهندس معين بالفعل في هذا المشروع');
      }

      // Atomic CAS Reactivation
      const updateResult = await tx.projectAssignment.updateMany({
        where: {
          id: existing.id,
          status: AssignmentStatus.INACTIVE,
        },
        data: {
          status: AssignmentStatus.ACTIVE,
          assignedAt: new Date(),
          assignedById: actor.id,
          removedAt: null,
          removedById: null,
          removalReason: null,
        },
      });

      if (updateResult.count === 0) {
        throw new AppError('CONFLICT', 'تم تحديث حالة التعيين مسبقاً بواسطة عملية متزامنة');
      }

      assignmentId = existing.id;
      isReactivation = true;
    } else {
      // Initial Assignment Creation
      try {
        const created = await tx.projectAssignment.create({
          data: {
            projectId,
            engineerId,
            status: AssignmentStatus.ACTIVE,
            assignedAt: new Date(),
            assignedById: actor.id,
          },
        });
        assignmentId = created.id;
      } catch (err) {
        if (isProjectAssignmentUniqueViolation(err)) {
          throw new AppError('CONFLICT', 'المهندس معين بالفعل في هذا المشروع');
        }
        throw err;
      }
    }

    // 3.4 Append-Only Audit Log
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PROJECT_ENGINEER_ASSIGNED',
        entityType: 'PROJECT',
        entityId: projectId,
        metadata: {
          assignmentId,
          projectId,
          engineerId: targetEngineer.id,
          engineerName: targetEngineer.name,
          engineerEmail: targetEngineer.email,
          isReactivation,
          reason: reason ?? null,
        },
      },
    });

    // 3.5 Fetch fresh record with relations for safe DTO mapping
    const resultRecord = await tx.projectAssignment.findUniqueOrThrow({
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

    return toProjectTeamMemberDTO(resultRecord);
  });

  return assignmentDto;
}

/**
 * lib/custodies/use-cases/reopen-custody.ts
 *
 * Use case: Creator reopens a REJECTED custody back to DRAFT for correction and resubmission.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT.
 * 2. Ownership: Only the creator can reopen their custody.
 * 3. State transition: REJECTED -> DRAFT.
 * 4. Atomicity: State reset + CUSTODY_UPDATED AuditLog in SAME transaction.
 */

import { CustodyStatus, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { isEngineerAssignedToProject } from '@/lib/project-team';
import { validate } from '@/lib/validation';
import { custodyIdSchema } from '@/lib/validation/schemas/custody';

import { toCustodySummaryDTO } from '../mappers';
import { assertCanTransitionCustodyStatus } from '../state-machine';
import type { CustodySummaryDTO } from '../types';

export async function reopenCustody(custodyId: unknown): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT
  const actor = await requireRole([Role.ENGINEER, Role.ACCOUNTANT]);

  // 2. Validate custodyId
  const idValidation = validate(custodyIdSchema, custodyId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Execute atomic transaction to reopen custody
  const reopened = await prisma.$transaction(async (tx) => {
    const custody = await tx.custody.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: { select: { id: true, status: true, deletedAt: true } },
      },
    });

    if (!custody) {
      throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
    }

    // 3.1 Verify ownership
    if (custody.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك إعادة فتح عهدة قام مستخدم آخر بإنشائها');
    }

    // 3.1.1 For Site Engineers: verify project status and active assignment (Slice 14 / BD-14-03, BD-14-04)
    if (actor.role === Role.ENGINEER) {
      if (custody.project.status !== ProjectStatus.ACTIVE || custody.project.deletedAt !== null) {
        throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
      }

      const isClaimantAssigned = await isEngineerAssignedToProject(custody.projectId, actor.id);
      if (!isClaimantAssigned) {
        throw new AppError(
          'FORBIDDEN',
          'لا يمكنك إعادة فتح عهدة نقدية لمشروع لست معيناً ضمن فريقه الهندسي',
        );
      }
    }

    // 3.2 Verify state transition (REJECTED -> DRAFT)
    assertCanTransitionCustodyStatus(custody.status, CustodyStatus.DRAFT);

    const now = new Date();

    // 3.3 Reset to DRAFT and clear rejection metadata
    const updated = await tx.custody.update({
      where: { id },
      data: {
        status: CustodyStatus.DRAFT,
        submittedById: null,
        submittedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        custodian: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      },
    });

    // 3.4 Write audit log
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_UPDATED',
        entityType: 'CUSTODY',
        entityId: updated.id,
        metadata: {
          code: updated.code,
          action: 'REOPENED_TO_DRAFT',
          reopenedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toCustodySummaryDTO(reopened);
}

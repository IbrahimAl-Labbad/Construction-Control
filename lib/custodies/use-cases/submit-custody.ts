/**
 * lib/custodies/use-cases/submit-custody.ts
 *
 * Use case: Submitter formally submits a Custody draft for Manager approval.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT.
 * 2. Ownership: Only creator can submit their draft.
 * 3. State transition: DRAFT -> SUBMITTED.
 * 4. Invariant 8: Maximum 1 active custody per custodian per project.
 * 5. Atomicity: Status update + CUSTODY_SUBMITTED AuditLog in SAME transaction.
 */

import { BudgetStatus, CustodyStatus, ProjectStatus, Role } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireRole } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { custodyIdSchema } from '@/lib/validation/schemas/custody';

import { toCustodySummaryDTO } from '../mappers';
import { assertCanTransitionCustodyStatus } from '../state-machine';
import type { CustodySummaryDTO } from '../types';

export async function submitCustody(custodyId: unknown): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT
  const actor = await requireRole([Role.ENGINEER, Role.ACCOUNTANT]);

  // 2. Validate custodyId
  const idValidation = validate(custodyIdSchema, custodyId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Execute atomic transaction to submit custody
  const submitted = await prisma.$transaction(async (tx) => {
    const custody = await tx.custody.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: { select: { id: true, status: true, code: true, name: true, deletedAt: true } },
      },
    });

    if (!custody) {
      throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
    }

    // 3.1 Verify ownership
    if (custody.createdById !== actor.id) {
      throw new AppError('FORBIDDEN', 'لا يمكنك تقديم مسودة عهدة قام مستخدم آخر بإنشائها');
    }

    // 3.2 Verify state machine transition (DRAFT -> SUBMITTED)
    assertCanTransitionCustodyStatus(custody.status, CustodyStatus.SUBMITTED);

    // 3.3 Verify project is active and not deleted
    if (custody.project.status !== ProjectStatus.ACTIVE || custody.project.deletedAt !== null) {
      throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
    }

    // 3.4 Verify active approved budget exists
    const approvedBudget = await tx.budget.findFirst({
      where: {
        projectId: custody.projectId,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
    }

    // 3.5 Invariant 8: Check if custodian already has an active/unsettled custody on this project
    const existingActive = await tx.custody.findFirst({
      where: {
        id: { not: custody.id },
        projectId: custody.projectId,
        custodianUserId: custody.custodianUserId,
        status: {
          in: [
            CustodyStatus.SUBMITTED,
            CustodyStatus.APPROVED,
            CustodyStatus.ISSUED,
            CustodyStatus.PARTIALLY_SETTLED,
          ],
        },
        deletedAt: null,
      },
      select: { id: true, code: true, status: true },
    });

    if (existingActive) {
      throw new AppError(
        'ACTIVE_CUSTODY_EXISTS',
        `يوجد بالفعل عهدة نشطة للموظف (${existingActive.code}) بحالة "${existingActive.status}" على نفس المشروع. يجب تصفيتها أولاً.`,
      );
    }

    const now = new Date();

    // 3.6 Update to SUBMITTED
    const updated = await tx.custody.update({
      where: { id },
      data: {
        status: CustodyStatus.SUBMITTED,
        submittedById: actor.id,
        submittedAt: now,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        custodian: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      },
    });

    // 3.7 Write CUSTODY_SUBMITTED audit log
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_SUBMITTED',
        entityType: 'CUSTODY',
        entityId: updated.id,
        metadata: {
          code: updated.code,
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          amount: updated.amount.toFixed(2),
          submittedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toCustodySummaryDTO(submitted);
}

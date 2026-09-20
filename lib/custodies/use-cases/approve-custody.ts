/**
 * lib/custodies/use-cases/approve-custody.ts
 *
 * Use case: Manager formally approves a submitted Custody request.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively.
 * 2. Separation of duties:
 *    - actor.id !== custody.createdById (creator cannot self-approve)
 *    - actor.id !== custody.custodianUserId (custodian cannot self-approve)
 * 3. State machine transition: SUBMITTED -> APPROVED.
 * 4. Lock Hierarchy (Canonical Order):
 *    1. SELECT id, amount FROM budget_lines WHERE id = ... FOR UPDATE
 *    2. SELECT id, status, amount FROM custodies WHERE id = ... FOR UPDATE
 * 5. Note on Financial Invariants:
 *    - APPROVED custody creates NO active budget exposure.
 *    - No cash has left corporate accounts.
 *    - Validates advance ceiling fits within total authorized line amount.
 * 6. Atomicity: Status update + CUSTODY_APPROVED AuditLog in SAME transaction.
 */

import { BudgetStatus, CustodyStatus, ProjectStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { custodyIdSchema } from '@/lib/validation/schemas/custody';

import { toCustodySummaryDTO } from '../mappers';
import { assertCanTransitionCustodyStatus } from '../state-machine';
import type { CustodySummaryDTO } from '../types';

export async function approveCustody(custodyId: unknown): Promise<CustodySummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate custodyId
  const idValidation = validate(custodyIdSchema, custodyId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Pre-transaction fetch for sanity & separation-of-duties check
  const preCheck = await prisma.custody.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      status: true,
      createdById: true,
      custodianUserId: true,
      budgetLineId: true,
      amount: true,
      projectId: true,
    },
  });

  if (!preCheck) {
    throw new AppError('NOT_FOUND', 'العهدة غير موجودة أو تم حذفها');
  }

  // 4. Assert separation of duties: Manager cannot be the creator OR the custodian
  if (preCheck.createdById === actor.id || preCheck.custodianUserId === actor.id) {
    throw new AppError(
      'FORBIDDEN_SELF_APPROVAL',
      'لا يمكن للمعتمد اعتماد عهدة قام بإنشائها أو عُيّن أميناً لها (مبدأ فصل المهام)',
    );
  }

  // 5. Assert state machine transition (SUBMITTED -> APPROVED)
  assertCanTransitionCustodyStatus(preCheck.status, CustodyStatus.APPROVED);

  // 6. Execute atomic approval transaction with Canonical Lock Hierarchy
  const now = new Date();
  const approved = await prisma.$transaction(async (tx) => {
    // 6.1 STEP 1: Lock the parent BudgetLine row (Canonical Lock Order 1)
    const lockedLines = await tx.$queryRaw<Array<{ id: string; amount: Prisma.Decimal }>>`
      SELECT id, amount FROM budget_lines
      WHERE id = ${preCheck.budgetLineId}
      FOR UPDATE
    `;

    const lockedLine = lockedLines[0];
    if (!lockedLine) {
      throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة غير موجود');
    }

    // 6.2 STEP 2: Lock the Custody row (Canonical Lock Order 2)
    const lockedCustodies = await tx.$queryRaw<Array<{ id: string; status: CustodyStatus; amount: Prisma.Decimal }>>`
      SELECT id, status, amount FROM custodies
      WHERE id = ${id}
      FOR UPDATE
    `;

    const lockedCustody = lockedCustodies[0];
    if (!lockedCustody) {
      throw new AppError('NOT_FOUND', 'العهدة غير موجودة');
    }

    if (lockedCustody.status !== CustodyStatus.SUBMITTED) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن اعتماد العهدة وهي في حالة "${lockedCustody.status}"، يجب أن تكون قيد الاعتماد (SUBMITTED)`,
      );
    }

    // 6.3 Revalidate project & budget invariants
    const project = await tx.project.findFirst({
      where: { id: preCheck.projectId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!project || project.status !== ProjectStatus.ACTIVE) {
      throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
    }

    const approvedBudget = await tx.budget.findFirst({
      where: {
        projectId: preCheck.projectId,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
    }

    // 6.4 Basic Sanity: advance envelope cannot exceed total budget line ceiling
    if (lockedCustody.amount.greaterThan(lockedLine.amount)) {
      throw new AppError(
        'BUDGET_LINE_EXCEEDED',
        `مبلغ العهدة (${lockedCustody.amount.toFixed(2)} ر.س) يتجاوز سقف بند الموازنة الإجمالي (${lockedLine.amount.toFixed(2)} ر.س)`,
      );
    }

    // 6.5 Update custody status to APPROVED
    const updated = await tx.custody.update({
      where: { id },
      data: {
        status: CustodyStatus.APPROVED,
        approvedById: actor.id,
        approvedAt: now,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        custodian: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, code: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      },
    });

    // 6.6 Write CUSTODY_APPROVED audit log
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'CUSTODY_APPROVED',
        entityType: 'CUSTODY',
        entityId: updated.id,
        metadata: {
          code: updated.code,
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          amount: updated.amount.toFixed(2),
          approvedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toCustodySummaryDTO(approved);
}

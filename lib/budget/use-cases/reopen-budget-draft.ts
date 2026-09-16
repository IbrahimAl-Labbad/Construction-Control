/**
 * lib/budget/use-cases/reopen-budget-draft.ts
 *
 * Use case: Manager reopens a rejected Project Budget back to DRAFT.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only.
 * 2. Validation: budgetIdSchema.
 * 3. State machine transition: REJECTED -> DRAFT.
 * 4. Version 1 rule: reopens the SAME record. No new Budget record is created.
 * 5. Atomicity: Status update + BUDGET_REOPENED AuditLog in SAME transaction.
 *
 * Follows User Directive 4 & 7.
 */

import { BudgetStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { budgetIdSchema } from '@/lib/validation/schemas/budget';

import { toBudgetDetailsDTO } from '../mappers';
import { assertCanTransitionBudgetStatus } from '../state-machine';
import type { BudgetDetailsDTO } from '../types';

/**
 * Reopens a rejected budget as a draft on the same Version 1 record.
 *
 * @param budgetId - CUID of the target budget
 * @returns Reopened budget as BudgetDetailsDTO
 */
export async function reopenBudgetDraft(budgetId: unknown): Promise<BudgetDetailsDTO> {
  // 1. Authorization — MANAGER only
  const actor = await requireManager();

  // 2. Validate budgetId
  const idValidation = validate(budgetIdSchema, budgetId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Fetch existing budget
  const existing = await prisma.budget.findFirst({
    where: { id, deletedAt: null },
    include: {
      lines: true,
      createdBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'الموازنة غير موجودة');
  }

  // 4. Assert state machine transition (REJECTED -> DRAFT)
  assertCanTransitionBudgetStatus(existing.status, BudgetStatus.DRAFT);

  // 5. Atomic transaction: update status to DRAFT on same record + audit log
  const reopened = await prisma.$transaction(async (tx) => {
    const budget = await tx.budget.update({
      where: { id },
      data: {
        status: BudgetStatus.DRAFT,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        lines: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'BUDGET_REOPENED',
        entityType: 'BUDGET',
        entityId: budget.id,
        metadata: {
          projectId: budget.projectId,
          version: budget.version,
          totalAmount: budget.totalAmount.toFixed(2),
          previousRejectionReason: existing.rejectionReason,
        },
      },
    });

    return budget;
  });

  return toBudgetDetailsDTO(reopened);
}

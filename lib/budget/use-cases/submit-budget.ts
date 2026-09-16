/**
 * lib/budget/use-cases/submit-budget.ts
 *
 * Use case: Manager submits a Project Budget draft for formal approval.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only.
 * 2. Validation: budgetIdSchema.
 * 3. State machine transition: DRAFT -> SUBMITTED.
 * 4. Business rule: must have at least 1 line item.
 * 5. Atomicity: Status update + BUDGET_SUBMITTED AuditLog in SAME transaction.
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
 * Submits a draft budget for formal approval.
 *
 * @param budgetId - CUID of the target budget
 * @returns Updated budget as BudgetDetailsDTO
 */
export async function submitBudget(budgetId: unknown): Promise<BudgetDetailsDTO> {
  // 1. Authorization — MANAGER only
  const actor = await requireManager();

  // 2. Validate budgetId
  const idValidation = validate(budgetIdSchema, budgetId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Fetch existing budget with lines
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

  // 4. Assert state machine transition
  assertCanTransitionBudgetStatus(existing.status, BudgetStatus.SUBMITTED);

  // 5. Invariant: must contain at least 1 line
  if (existing.lines.length === 0) {
    throw new AppError(
      'EMPTY_BUDGET',
      'لا يمكن تقديم موازنة لا تحتوي على أي بنود تكلفة',
    );
  }

  // 6. Atomic transaction: update status + audit log
  const updated = await prisma.$transaction(async (tx) => {
    const budget = await tx.budget.update({
      where: { id },
      data: { status: BudgetStatus.SUBMITTED },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        lines: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'BUDGET_SUBMITTED',
        entityType: 'BUDGET',
        entityId: budget.id,
        metadata: {
          projectId: budget.projectId,
          version: budget.version,
          totalAmount: budget.totalAmount.toFixed(2),
          lineCount: budget.lines.length,
        },
      },
    });

    return budget;
  });

  return toBudgetDetailsDTO(updated);
}

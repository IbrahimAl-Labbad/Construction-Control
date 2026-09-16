/**
 * lib/budget/use-cases/reject-budget.ts
 *
 * Use case: Manager formally rejects a submitted Project Budget.
 *
 * Enforces:
 * 1. Authorization: MANAGER role only.
 * 2. Validation: budgetIdSchema and rejectBudgetSchema (mandatory rejection reason).
 * 3. State machine transition: SUBMITTED -> REJECTED.
 * 4. Atomicity: Status update + reason + BUDGET_REJECTED AuditLog in SAME transaction.
 */

import { BudgetStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  budgetIdSchema,
  rejectBudgetSchema,
} from '@/lib/validation/schemas/budget';

import { toBudgetDetailsDTO } from '../mappers';
import { assertCanTransitionBudgetStatus } from '../state-machine';
import type { BudgetDetailsDTO } from '../types';

/**
 * Rejects a submitted budget with a mandatory reason.
 *
 * @param budgetId - CUID of the target budget
 * @param rawInput - Raw payload { rejectionReason }
 * @returns Rejected budget as BudgetDetailsDTO
 */
export async function rejectBudget(
  budgetId: unknown,
  rawInput: unknown,
): Promise<BudgetDetailsDTO> {
  // 1. Authorization — MANAGER only
  const actor = await requireManager();

  // 2. Validate budgetId
  const idValidation = validate(budgetIdSchema, budgetId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Validate input
  const inputValidation = validate(rejectBudgetSchema, rawInput);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const { rejectionReason } = inputValidation.data;

  // 4. Fetch existing budget
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

  // 5. Assert state machine transition (SUBMITTED -> REJECTED)
  assertCanTransitionBudgetStatus(existing.status, BudgetStatus.REJECTED);

  // 6. Atomic transaction: update status, record rejection reason, write audit log
  const rejected = await prisma.$transaction(async (tx) => {
    const budget = await tx.budget.update({
      where: { id },
      data: {
        status: BudgetStatus.REJECTED,
        rejectionReason,
        approvedById: actor.id,
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
        action: 'BUDGET_REJECTED',
        entityType: 'BUDGET',
        entityId: budget.id,
        metadata: {
          projectId: budget.projectId,
          version: budget.version,
          rejectionReason,
          totalAmount: budget.totalAmount.toFixed(2),
        },
      },
    });

    return budget;
  });

  return toBudgetDetailsDTO(rejected);
}

/**
 * lib/expenses/use-cases/reject-expense.ts
 *
 * Use case: Manager formally rejects a submitted Expense claim with a mandatory reason.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only.
 * 2. State machine transition: SUBMITTED -> REJECTED.
 * 3. Dedicated rejection tracking (Gates 1 & 18):
 *    - Uses rejectedById, rejectedAt, rejectionReason.
 *    - approvedById is NEVER populated for rejection.
 * 4. Validation: Mandatory non-empty rejectionReason (min 3, max 500 chars).
 * 5. Atomicity: Rejection update + EXPENSE_REJECTED AuditLog in SAME transaction.
 */

import { ExpenseStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import {
  expenseIdSchema,
  rejectExpenseSchema,
} from '@/lib/validation/schemas/expense';

import { toExpenseSummaryDTO } from '../mappers';
import { assertCanTransitionExpenseStatus } from '../state-machine';
import type { ExpenseSummaryDTO } from '../types';

/**
 * Formally rejects a submitted expense claim.
 */
export async function rejectExpense(
  expenseId: unknown,
  rawInput: unknown,
): Promise<ExpenseSummaryDTO> {
  // 1. Authentication & Authorization (MANAGER only)
  const actor = await requireManager();

  // 2. Validate expenseId
  const idValidation = validate(expenseIdSchema, expenseId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Validate rejection input
  const inputValidation = validate(rejectExpenseSchema, rawInput);
  if (!inputValidation.success) {
    throw new ValidationError(inputValidation.errors);
  }
  const { rejectionReason } = inputValidation.data;

  // 4. Fetch existing expense
  const existing = await prisma.expense.findFirst({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'المصروف غير موجود');
  }

  // 5. Assert state machine transition (SUBMITTED -> REJECTED)
  assertCanTransitionExpenseStatus(existing.status, ExpenseStatus.REJECTED);

  // 6. Atomic transaction: update rejection metadata + audit log (Gate 30)
  const now = new Date();
  const rejected = await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.update({
      where: { id },
      data: {
        status: ExpenseStatus.REJECTED,
        rejectedById: actor.id,
        rejectedAt: now,
        rejectionReason,
      },
      include: {
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        rejectedBy: { select: { id: true, name: true, email: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'EXPENSE_REJECTED',
        entityType: 'EXPENSE',
        entityId: updated.id,
        metadata: {
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          amount: updated.amount.toFixed(2),
          rejectionReason,
          rejectedAt: now.toISOString(),
        },
      },
    });

    return updated;
  });

  return toExpenseSummaryDTO(rejected);
}

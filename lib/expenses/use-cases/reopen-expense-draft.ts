/**
 * lib/expenses/use-cases/reopen-expense-draft.ts
 *
 * Use case: Field staff reopens a REJECTED Expense claim back to DRAFT.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT.
 * 2. Ownership: submittedById === actor.id (only original claimant can reopen).
 * 3. State machine transition: REJECTED -> DRAFT.
 * 4. Reopen cleanup (Gate 17):
 *    - Clears rejectedById, rejectedAt, rejectionReason.
 *    - Preserves previous rejection details in the append-only AuditLog.
 * 5. Atomicity: Status update + EXPENSE_REOPENED AuditLog in SAME transaction.
 */

import { ExpenseStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { validate } from '@/lib/validation';
import { expenseIdSchema } from '@/lib/validation/schemas/expense';

import { toExpenseSummaryDTO } from '../mappers';
import { assertCanTransitionExpenseStatus } from '../state-machine';
import type { ExpenseSummaryDTO } from '../types';

/**
 * Reopens a rejected expense claim back to draft on the same record.
 */
export async function reopenExpenseDraft(expenseId: unknown): Promise<ExpenseSummaryDTO> {
  // 1. Authentication & Authorization
  const actor = await requireAuth();
  if (!policies.canManageExpenseDraft(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بإعادة فتح مطالبات المصروفات');
  }

  // 2. Validate expenseId
  const idValidation = validate(expenseIdSchema, expenseId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Fetch existing expense
  const existing = await prisma.expense.findFirst({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'المصروف غير موجود');
  }

  // 4. Ownership check (Gate 11)
  if (existing.submittedById !== actor.id) {
    throw new AppError(
      'FORBIDDEN',
      'لا يمكنك إعادة فتح مصروف قام بإنشائه مستخدم آخر',
    );
  }

  // 5. Assert state machine transition (REJECTED -> DRAFT)
  assertCanTransitionExpenseStatus(existing.status, ExpenseStatus.DRAFT);

  // 6. Atomic transaction: clear rejection fields, set status DRAFT, write audit log
  const reopened = await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.update({
      where: { id },
      data: {
        status: ExpenseStatus.DRAFT,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
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
        action: 'EXPENSE_REOPENED',
        entityType: 'EXPENSE',
        entityId: updated.id,
        metadata: {
          projectId: updated.projectId,
          budgetLineId: updated.budgetLineId,
          amount: updated.amount.toFixed(2),
          previousRejectionReason: existing.rejectionReason,
          previousRejectedById: existing.rejectedById,
        },
      },
    });

    return updated;
  });

  return toExpenseSummaryDTO(reopened);
}

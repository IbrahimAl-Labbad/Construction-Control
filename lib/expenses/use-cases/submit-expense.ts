/**
 * lib/expenses/use-cases/submit-expense.ts
 *
 * Use case: Field staff submits a DRAFT Expense for formal manager approval.
 *
 * Enforces:
 * 1. Authorization: Role.ENGINEER or Role.ACCOUNTANT.
 * 2. Ownership: submittedById === actor.id (only claimant can submit).
 * 3. State machine transition: DRAFT -> SUBMITTED.
 * 4. Invariant revalidation (Item 10):
 *    - Target project must be ACTIVE and not deleted.
 *    - Target project must have an APPROVED non-deleted budget.
 *    - Target budget line must belong to that approved budget.
 * 5. Atomicity: Status update + EXPENSE_SUBMITTED AuditLog in SAME transaction.
 */

import { BudgetStatus, ExpenseStatus, ProjectStatus } from '@prisma/client';

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
 * Submits a draft expense for manager approval.
 */
export async function submitExpense(expenseId: unknown): Promise<ExpenseSummaryDTO> {
  // 1. Authentication & Authorization
  const actor = await requireAuth();
  if (!policies.canSubmitExpense(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بتقديم مطالبات المصروفات');
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
    include: {
      project: { select: { id: true, status: true, deletedAt: true } },
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'المصروف غير موجود');
  }

  // 4. Ownership check
  if (existing.submittedById !== actor.id) {
    throw new AppError(
      'FORBIDDEN',
      'لا يمكنك تقديم مصروف قام بإنشائه مستخدم آخر',
    );
  }

  // 5. Assert state machine transition
  assertCanTransitionExpenseStatus(existing.status, ExpenseStatus.SUBMITTED);

  // 6. Invariant revalidation (item 10): Project must be ACTIVE
  if (existing.project.status !== ProjectStatus.ACTIVE || existing.project.deletedAt !== null) {
    throw new AppError(
      'INVALID_PROJECT_STATUS',
      'لا يمكن تقديم مصروف لمشروع غير نشط أو محذوف',
    );
  }

  // 7. Invariant revalidation: Project must have an APPROVED non-deleted budget
  const approvedBudget = await prisma.budget.findFirst({
    where: {
      projectId: existing.projectId,
      status: BudgetStatus.APPROVED,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!approvedBudget) {
    throw new AppError(
      'BUDGET_NOT_APPROVED',
      'لا يمكن تقديم المصروف لأن المشروع لا يمتلك موازنة معتمدة نشطة',
    );
  }

  // 8. Invariant revalidation: BudgetLine must belong to this approved budget
  const budgetLine = await prisma.budgetLine.findFirst({
    where: {
      id: existing.budgetLineId,
      budgetId: approvedBudget.id,
    },
    select: { id: true },
  });

  if (!budgetLine) {
    throw new AppError(
      'INVALID_BUDGET_LINE',
      'بند الموازنة المرتبط بهذا المصروف لم يعد متاحاً أو صالحاً',
    );
  }

  // 9. Atomic transaction: update status + audit log
  const now = new Date();
  const submitted = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.update({
      where: { id },
      data: {
        status: ExpenseStatus.SUBMITTED,
        submittedAt: now,
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
        action: 'EXPENSE_SUBMITTED',
        entityType: 'EXPENSE',
        entityId: expense.id,
        metadata: {
          projectId: expense.projectId,
          budgetLineId: expense.budgetLineId,
          amount: expense.amount.toFixed(2),
          submittedAt: now.toISOString(),
        },
      },
    });

    return expense;
  });

  return toExpenseSummaryDTO(submitted);
}

/**
 * lib/expenses/use-cases/approve-expense.ts
 *
 * Use case: Manager formally approves a submitted Expense claim.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (exclusive approval authority).
 * 2. Separation of duties: actor.id !== expense.submittedById (self-approval forbidden).
 * 3. State machine transition: SUBMITTED -> APPROVED.
 * 4. Approval Concurrency & Pessimistic Row Locking (Gates 4, 5, 26, 27):
 *    - Executes inside prisma.$transaction.
 *    - Acquires PostgreSQL row-level lock: SELECT id, amount FROM budget_lines WHERE id = ... FOR UPDATE.
 *    - Revalidates expense status inside the locked transaction.
 *    - Aggregates current APPROVED spend on the locked budget line.
 *    - Enforces hard budget ceiling: currentSpend + expense.amount <= BudgetLine.amount.
 * 5. Immutability trigger: Once APPROVED, expense can never be mutated or deleted.
 * 6. Atomicity: Status update + approval metadata + EXPENSE_APPROVED AuditLog in SAME transaction.
 */

import { BudgetStatus, CommitmentStatus, ExpenseStatus, Prisma, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { expenseIdSchema } from '@/lib/validation/schemas/expense';

import { toExpenseSummaryDTO } from '../mappers';
import { assertCanTransitionExpenseStatus } from '../state-machine';
import type { ExpenseSummaryDTO } from '../types';

/**
 * Approves a submitted expense claim, committing it as realized actual spend.
 */
export async function approveExpense(expenseId: unknown): Promise<ExpenseSummaryDTO> {
  // 1. Authentication & Authorization (MANAGER only)
  const actor = await requireManager();

  // 2. Validate expenseId
  const idValidation = validate(expenseIdSchema, expenseId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Pre-transaction fetch for sanity & separation-of-duties check
  const preCheck = await prisma.expense.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      status: true,
      submittedById: true,
      budgetLineId: true,
      amount: true,
      projectId: true,
    },
  });

  if (!preCheck) {
    throw new AppError('NOT_FOUND', 'المصروف غير موجود');
  }

  // 4. Assert separation of duties: Approver cannot be the submitter
  if (preCheck.submittedById === actor.id) {
    throw new AppError(
      'FORBIDDEN_SELF_APPROVAL',
      'لا يمكن للمعتمد اعتماد مصروف قام بتقديمه بنفسه (مبدأ فصل المهام)',
    );
  }

  // 5. Assert state machine transition (SUBMITTED -> APPROVED)
  assertCanTransitionExpenseStatus(preCheck.status, ExpenseStatus.APPROVED);

  // 6. Execute atomic approval transaction with BudgetLine row-level locking
  const now = new Date();
  const approved = await prisma.$transaction(async (tx) => {
    // 6.1 Lock the parent budget line row (Gate 4 & 26)
    const lockedLines = await tx.$queryRaw<Array<{ id: string; amount: Prisma.Decimal }>>`
      SELECT id, amount FROM budget_lines
      WHERE id = ${preCheck.budgetLineId}
      FOR UPDATE
    `;

    const lockedLine = lockedLines[0];
    if (!lockedLine) {
      throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة غير موجود');
    }

    // 6.2 Revalidate expense status inside locked transaction (Gate 28)
    const expenseToApprove = await tx.expense.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: { select: { id: true, status: true, deletedAt: true } },
      },
    });

    if (!expenseToApprove) {
      throw new AppError('NOT_FOUND', 'المصروف غير موجود');
    }

    if (expenseToApprove.status !== ExpenseStatus.SUBMITTED) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `لا يمكن اعتماد المصروف وهو في حالة "${expenseToApprove.status}"، يجب أن يكون قيد الاعتماد (SUBMITTED)`,
      );
    }

    // 6.3 Revalidate project & budget invariants (Gate 3)
    if (expenseToApprove.project.status !== ProjectStatus.ACTIVE || expenseToApprove.project.deletedAt !== null) {
      throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
    }

    const approvedBudget = await tx.budget.findFirst({
      where: {
        projectId: expenseToApprove.projectId,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
    }

    // 6.4 Aggregate current APPROVED spend and commitments on this budget line after acquiring the lock (Joint Financial Concurrency Invariant)
    const approvedExpensesAgg = await tx.expense.aggregate({
      where: {
        budgetLineId: expenseToApprove.budgetLineId,
        status: ExpenseStatus.APPROVED,
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    const approvedCommitmentsAgg = await tx.commitment.aggregate({
      where: {
        budgetLineId: expenseToApprove.budgetLineId,
        status: CommitmentStatus.APPROVED,
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    const currentSpend = approvedExpensesAgg._sum.amount ?? new Prisma.Decimal('0.00');
    const currentCommitments = approvedCommitmentsAgg._sum.amount ?? new Prisma.Decimal('0.00');
    const currentExposure = currentSpend.add(currentCommitments);
    const newTotalSpend = currentExposure.add(expenseToApprove.amount);

    // 6.5 Enforce hard budget ceiling
    if (newTotalSpend.greaterThan(lockedLine.amount)) {
      const remainingAvailable = lockedLine.amount.sub(currentExposure);
      throw new AppError(
        'BUDGET_LINE_EXCEEDED',
        `مبلغ المصروف (${expenseToApprove.amount.toFixed(2)} ر.س) يتجاوز الرصيد المتاح لبند الموازنة (${remainingAvailable.toFixed(2)} ر.س)`,
      );
    }

    // 6.6 Update expense record to APPROVED
    const updatedExpense = await tx.expense.update({
      where: { id },
      data: {
        status: ExpenseStatus.APPROVED,
        approvedById: actor.id,
        approvedAt: now,
      },
      include: {
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        rejectedBy: { select: { id: true, name: true, email: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });

    // 6.7 Write EXPENSE_APPROVED audit log inside same transaction (Gate 29)
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'EXPENSE_APPROVED',
        entityType: 'EXPENSE',
        entityId: updatedExpense.id,
        metadata: {
          projectId: updatedExpense.projectId,
          budgetLineId: updatedExpense.budgetLineId,
          amount: updatedExpense.amount.toFixed(2),
          previousApprovedSpend: currentSpend.toFixed(2),
          newApprovedSpend: newTotalSpend.toFixed(2),
          remainingLineBalance: lockedLine.amount.sub(newTotalSpend).toFixed(2),
          approvedAt: now.toISOString(),
        },
      },
    });

    return updatedExpense;
  });

  return toExpenseSummaryDTO(approved);
}

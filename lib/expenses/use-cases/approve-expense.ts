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

import { BudgetStatus, CommitmentStatus, CustodyStatus, ExpenseStatus, PayrollStatus, Prisma, ProjectStatus } from '@prisma/client';

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
      custodyId: true,
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
    // 6.1 Lock the parent budget line row (Canonical Lock Order 1)
    const lockedLines = await tx.$queryRaw<Array<{ id: string; amount: Prisma.Decimal }>>`
      SELECT id, amount FROM budget_lines
      WHERE id = ${preCheck.budgetLineId}
      FOR UPDATE
    `;

    const lockedLine = lockedLines[0];
    if (!lockedLine) {
      throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة غير موجود');
    }

    // 6.2 Revalidate expense status inside locked transaction
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

    // 6.3 Revalidate project & budget invariants
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

    // 6.4 Custody Branch (Canonical Lock Order 2)
    let custodyToUpdate: { id: string; code: string; isFullySettled: boolean } | null = null;
    if (expenseToApprove.custodyId) {
      const lockedCustodies = await tx.$queryRaw<
        Array<{
          id: string;
          code: string;
          projectId: string;
          budgetLineId: string;
          custodianUserId: string;
          amount: Prisma.Decimal;
          cashReturnedAmount: Prisma.Decimal;
          status: CustodyStatus;
        }>
      >`
        SELECT id, code, "projectId", "budgetLineId", "custodianUserId", amount, "cashReturnedAmount", status
        FROM custodies
        WHERE id = ${expenseToApprove.custodyId}
        FOR UPDATE
      `;

      const lockedCustody = lockedCustodies[0];
      if (!lockedCustody) {
        throw new AppError('NOT_FOUND', 'العهدة المرتبطة بالمصروف غير موجودة');
      }

      if (
        lockedCustody.status !== CustodyStatus.ISSUED &&
        lockedCustody.status !== CustodyStatus.PARTIALLY_SETTLED
      ) {
        throw new AppError(
          'CUSTODY_NOT_ISSUED',
          `لا يمكن اعتماد مصروف مرتبط بعهدة بحالة "${lockedCustody.status}". يجب أن تكون منصرفة (ISSUED أو PARTIALLY_SETTLED)`,
        );
      }

      if (lockedCustody.projectId !== expenseToApprove.projectId) {
        throw new AppError('INVALID_EXPENSE_LINKAGE', 'مشروع العهدة لا يتطابق مع مشروع المصروف');
      }

      if (lockedCustody.budgetLineId !== expenseToApprove.budgetLineId) {
        throw new AppError('INVALID_EXPENSE_LINKAGE', 'بند موازنة العهدة لا يتطابق مع بند موازنة المصروف');
      }

      if (lockedCustody.custodianUserId !== expenseToApprove.submittedById) {
        throw new AppError('FORBIDDEN', 'أمين العهدة فقط هو المخول بتقديم مصروفات لتسوية هذه العهدة');
      }

      // Aggregate existing approved expenses on this custody
      const custodyExpensesAgg = await tx.expense.aggregate({
        where: {
          custodyId: lockedCustody.id,
          status: ExpenseStatus.APPROVED,
          deletedAt: null,
        },
        _sum: { amount: true },
      });
      const currentSettled = custodyExpensesAgg._sum.amount ?? new Prisma.Decimal('0.00');
      const remainingAdvance = lockedCustody.amount.sub(currentSettled).sub(lockedCustody.cashReturnedAmount);

      if (expenseToApprove.amount.greaterThan(remainingAdvance)) {
        throw new AppError(
          'CUSTODY_BALANCE_EXCEEDED',
          `مبلغ المصروف (${expenseToApprove.amount.toFixed(2)} ر.س) يتجاوز الرصيد المتبقي في العهدة (${remainingAdvance.toFixed(2)} ر.س)`,
        );
      }

      const newSettled = currentSettled.add(expenseToApprove.amount);
      const finalRemaining = lockedCustody.amount.sub(newSettled).sub(lockedCustody.cashReturnedAmount);
      const isFullySettled = finalRemaining.equals(0);

      custodyToUpdate = {
        id: lockedCustody.id,
        code: lockedCustody.code,
        isFullySettled,
      };
    }

    // 6.5 Aggregate active exposure on this budget line (Direct Spend + Custody Spend + Commitments + Outstanding Custodies)
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

    // Outstanding custodies on this line
    const activeCustodies = await tx.custody.findMany({
      where: {
        budgetLineId: expenseToApprove.budgetLineId,
        status: { in: [CustodyStatus.ISSUED, CustodyStatus.PARTIALLY_SETTLED] },
        deletedAt: null,
      },
      include: {
        expenses: {
          where: { status: ExpenseStatus.APPROVED, deletedAt: null },
          select: { amount: true },
        },
      },
    });

    let outstandingCustodies = new Prisma.Decimal('0.00');
    for (const c of activeCustodies) {
      const settled = c.expenses.reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));
      const remaining = c.amount.sub(settled).sub(c.cashReturnedAmount);
      outstandingCustodies = outstandingCustodies.add(remaining);
    }

    const approvedPayrollAgg = tx.payrollEntry
      ? await tx.payrollEntry.aggregate({
          where: {
            budgetLineId: expenseToApprove.budgetLineId,
            status: PayrollStatus.APPROVED,
            deletedAt: null,
          },
          _sum: { amount: true },
        })
      : { _sum: { amount: null } };
    const approvedPayroll = approvedPayrollAgg._sum.amount ?? new Prisma.Decimal('0.00');

    const currentSpend = approvedExpensesAgg._sum.amount ?? new Prisma.Decimal('0.00');
    const currentCommitments = approvedCommitmentsAgg._sum.amount ?? new Prisma.Decimal('0.00');
    const totalActiveExposure = currentSpend
      .add(currentCommitments)
      .add(outstandingCustodies)
      .add(approvedPayroll);

    // Invariant 4 & 5:
    // If direct expense: increases active exposure -> check totalActiveExposure + amount <= line.amount
    // If custody expense: converts outstanding custody into spend -> active exposure is preserved
    if (!expenseToApprove.custodyId) {
      const newTotalExposure = totalActiveExposure.add(expenseToApprove.amount);
      if (newTotalExposure.greaterThan(lockedLine.amount)) {
        const remainingAvailable = lockedLine.amount.sub(totalActiveExposure);
        throw new AppError(
          'BUDGET_LINE_EXCEEDED',
          `مبلغ المصروف (${expenseToApprove.amount.toFixed(2)} ر.س) يتجاوز الرصيد المتاح لبند الموازنة (${remainingAvailable.toFixed(2)} ر.س)`,
        );
      }
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

    // 6.7 If custody linked, update custody status
    if (custodyToUpdate) {
      const newStatus = custodyToUpdate.isFullySettled
        ? CustodyStatus.SETTLED
        : CustodyStatus.PARTIALLY_SETTLED;

      await tx.custody.update({
        where: { id: custodyToUpdate.id },
        data: {
          status: newStatus,
          settledAt: custodyToUpdate.isFullySettled ? now : null,
        },
      });

      if (custodyToUpdate.isFullySettled) {
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'CUSTODY_SETTLED',
            entityType: 'CUSTODY',
            entityId: custodyToUpdate.id,
            metadata: {
              code: custodyToUpdate.code,
              settledAt: now.toISOString(),
            },
          },
        });
      }
    }

    // 6.8 Write EXPENSE_APPROVED audit log
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'EXPENSE_APPROVED',
        entityType: 'EXPENSE',
        entityId: updatedExpense.id,
        metadata: {
          projectId: updatedExpense.projectId,
          budgetLineId: updatedExpense.budgetLineId,
          custodyId: expenseToApprove.custodyId,
          amount: updatedExpense.amount.toFixed(2),
          approvedAt: now.toISOString(),
        },
      },
    });

    return updatedExpense;
  });

  return toExpenseSummaryDTO(approved);
}

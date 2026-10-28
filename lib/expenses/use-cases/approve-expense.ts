/**
 * lib/expenses/use-cases/approve-expense.ts
 *
 * Use case: Manager formally approves a submitted Expense claim.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER only (exclusive approval authority).
 * 2. Separation of duties: actor.id !== expense.submittedById (self-approval forbidden).
 * 3. State machine transition: SUBMITTED -> APPROVED.
 * 4. Approval Concurrency & Pessimistic Row Locking (Gates 4, 5, 26, 27 & Slice 21A):
 *    - Executes inside prisma.$transaction.
 *    - Acquires PostgreSQL row-level locks in canonical order:
 *      budget_lines (Level 1) -> custodies (Level 4, if linked) -> expenses (Level 6).
 *    - Revalidates expense status, project, budgetLineId, and custodyId inside the locked transaction.
 *    - Aggregates current APPROVED spend on the locked budget line and custody.
 *    - Enforces hard budget ceiling: currentSpend + expense.amount <= BudgetLine.amount.
 * 5. Immutability trigger: Once APPROVED, expense can never be mutated or deleted.
 * 6. Atomicity: Status update + approval metadata + EXPENSE_APPROVED AuditLog in SAME transaction.
 */

import { BudgetStatus, CommitmentStatus, CustodyStatus, ExpenseStatus, PayrollStatus, Prisma, ProjectStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { expenseIdSchema } from '@/lib/validation/schemas/expense';

import { toExpenseSummaryDTO } from '../mappers';
import { assertCanTransitionExpenseStatus } from '../state-machine';
import { isBudgetLineOverCeiling, calculateRemainingBudgetLineBalance } from '@/lib/budget';
import { calculateCustodyBalances, sumOutstandingCustodyBalances } from '@/lib/custodies';
import type { ExpenseSummaryDTO } from '../types';

const MAX_LINKAGE_RETRIES = 3;

class StaleLinkageRetryError extends Error {
  constructor() {
    super('STALE_LINKAGE_RETRY');
    this.name = 'StaleLinkageRetryError';
  }
}

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

  for (let attempt = 1; attempt <= MAX_LINKAGE_RETRIES; attempt++) {
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

    const candidateBudgetLineId = preCheck.budgetLineId;
    const candidateCustodyId = preCheck.custodyId ?? null;

    // 6. Execute atomic approval transaction with Canonical Lock Hierarchy
    const now = new Date();
    let approved;
    try {
      approved = await prisma.$transaction(async (tx) => {
        // 6.1 Lock the parent budget line row (Canonical Lock Order 1)
        const lockedLines = await tx.$queryRaw<
          Array<{ id: string; amount: Prisma.Decimal; budgetId?: string }>
        >`
          SELECT id, amount, "budgetId" FROM budget_lines
          WHERE id = ${candidateBudgetLineId}
          FOR UPDATE
        `;

        const lockedLine = lockedLines[0];
        if (!lockedLine) {
          throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة غير موجود');
        }

        // 6.2 Lock Custody row if linked (Canonical Lock Order 2 — before Expense lock)
        let lockedCustody: {
          id: string;
          code: string;
          projectId: string;
          budgetLineId: string;
          custodianUserId: string;
          amount: Prisma.Decimal;
          cashReturnedAmount: Prisma.Decimal;
          status: CustodyStatus;
          deletedAt?: Date | null;
        } | null = null;

        if (candidateCustodyId) {
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
              deletedAt?: Date | null;
            }>
          >`
            SELECT id, code, "projectId", "budgetLineId", "custodianUserId", amount, "cashReturnedAmount", status, "deletedAt"
            FROM custodies
            WHERE id = ${candidateCustodyId}
            FOR UPDATE
          `;
          lockedCustody = lockedCustodies[0] ?? null;
        }

        // 6.3 Lock Expense row (Canonical Lock Order 3) & revalidate inside locked transaction
        await tx.$queryRaw`
          SELECT id FROM expenses
          WHERE id = ${id}
          FOR UPDATE
        `;

        const expenseToApprove = await tx.expense.findFirst({
          where: { id, deletedAt: null },
          include: {
            project: { select: { id: true, status: true, deletedAt: true } },
          },
        });

        if (!expenseToApprove) {
          throw new AppError('NOT_FOUND', 'المصروف غير موجود');
        }

        if (expenseToApprove.submittedById === actor.id) {
          throw new AppError(
            'FORBIDDEN_SELF_APPROVAL',
            'لا يمكن للمعتمد اعتماد مصروف قام بتقديمه بنفسه (مبدأ فصل المهام)',
          );
        }

        if (expenseToApprove.status !== ExpenseStatus.SUBMITTED) {
          throw new AppError(
            'INVALID_STATE_TRANSITION',
            `لا يمكن اعتماد المصروف وهو في حالة "${expenseToApprove.status}"، يجب أن يكون قيد الاعتماد (SUBMITTED)`,
          );
        }

        if (
          expenseToApprove.budgetLineId !== candidateBudgetLineId ||
          (expenseToApprove.custodyId ?? null) !== candidateCustodyId
        ) {
          throw new StaleLinkageRetryError();
        }

        // 6.4 Revalidate project & budget invariants
        if (
          expenseToApprove.project.status !== ProjectStatus.ACTIVE ||
          expenseToApprove.project.deletedAt !== null
        ) {
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

        if (lockedLine.budgetId && lockedLine.budgetId !== approvedBudget.id) {
          throw new AppError(
            'INVALID_BUDGET_LINE',
            'بند الموازنة المرتبط بهذا المصروف لا ينتمي لموازنة المشروع المعتمدة النشطة',
          );
        }

        // 6.5 Custody Validation & Authoritative Balance Gate under lock
        let custodyToUpdate: { id: string; code: string; isFullySettled: boolean } | null = null;
        if (expenseToApprove.custodyId) {
          if (!lockedCustody || lockedCustody.deletedAt) {
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
          const { remainingBalance: remainingAdvance } = calculateCustodyBalances({
            amount: lockedCustody.amount,
            settledExpenses: currentSettled,
            cashReturned: lockedCustody.cashReturnedAmount,
          });

          if (expenseToApprove.amount.greaterThan(remainingAdvance)) {
            throw new AppError(
              'CUSTODY_BALANCE_EXCEEDED',
              `مبلغ المصروف (${expenseToApprove.amount.toFixed(2)} ر.س) يتجاوز الرصيد المتبقي في العهدة (${remainingAdvance.toFixed(2)} ر.س)`,
            );
          }

          const newSettled = currentSettled.add(expenseToApprove.amount);
          const { remainingBalance: finalRemaining } = calculateCustodyBalances({
            amount: lockedCustody.amount,
            settledExpenses: newSettled,
            cashReturned: lockedCustody.cashReturnedAmount,
          });
          const isFullySettled = finalRemaining.equals(0);

          custodyToUpdate = {
            id: lockedCustody.id,
            code: lockedCustody.code,
            isFullySettled,
          };
        }

        // 6.6 Aggregate active exposure on this budget line (Direct Spend + Custody Spend + Commitments + Outstanding Custodies)
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

        const outstandingCustodies = sumOutstandingCustodyBalances(activeCustodies);

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
          if (isBudgetLineOverCeiling(totalActiveExposure, expenseToApprove.amount, lockedLine.amount)) {
            const remainingAvailable = calculateRemainingBudgetLineBalance(
              lockedLine.amount,
              totalActiveExposure,
            );
            throw new AppError(
              'BUDGET_LINE_EXCEEDED',
              `مبلغ المصروف (${expenseToApprove.amount.toFixed(2)} ر.س) يتجاوز الرصيد المتاح لبند الموازنة (${remainingAvailable.toFixed(2)} ر.س)`,
            );
          }
        }

        // 6.7 Update expense record to APPROVED
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

        // 6.8 If custody linked, update custody status
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

        // 6.9 Write EXPENSE_APPROVED audit log
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
    } catch (error) {
      if (error instanceof StaleLinkageRetryError) {
        if (attempt < MAX_LINKAGE_RETRIES) {
          continue;
        }
        throw new AppError(
          'CONFLICT',
          'تم تعديل ارتباطات المصروف بشكل متزامن أثناء الاعتماد، يرجى المحاولة مرة أخرى',
        );
      }
      if (!(error instanceof AppError)) {
        logger.error('expense.approval_transaction_failed', {
          expenseId: id,
          actorId: actor.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }

    logger.info('expense.approved', {
      expenseId: approved.id,
      projectId: approved.projectId,
      budgetLineId: approved.budgetLineId,
      actorId: actor.id,
      amount: approved.amount.toFixed(2),
    });

    return toExpenseSummaryDTO(approved);
  }

  throw new AppError(
    'CONFLICT',
    'تم تعديل ارتباطات المصروف بشكل متزامن أثناء الاعتماد، يرجى المحاولة مرة أخرى',
  );
}

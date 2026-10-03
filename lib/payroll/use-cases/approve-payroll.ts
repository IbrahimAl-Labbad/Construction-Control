/**
 * lib/payroll/use-cases/approve-payroll.ts
 *
 * Use case: Manager formally approves a submitted PayrollEntry.
 * Vertical Slice 8 — Payroll Data Entry / Project Labor Cost Control.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER exclusively (requireManager).
 * 2. Separation of duties: actor.id !== entry.createdById (self-approval forbidden).
 * 3. State machine transition: SUBMITTED -> APPROVED.
 * 4. Approval Concurrency & Pessimistic Row Locking:
 *    - Executes inside prisma.$transaction.
 *    - Canonical Lock Order 1:
 *      SELECT id, amount, category, "budgetId" FROM budget_lines WHERE id = ... FOR UPDATE.
 *    - Canonical Lock Order 2:
 *      SELECT id, "projectId", "budgetLineId", amount, currency, "periodYear", "periodMonth", status, "createdById", "deletedAt"
 *      FROM payroll_entries WHERE id = ... FOR UPDATE.
 *    - Validates BudgetLine/project/budget invariants:
 *      - budgetLine.category === BudgetCategory.LABOR (INVALID_BUDGET_LINE_CATEGORY)
 *      - project is ACTIVE and not deleted (INVALID_PROJECT_STATUS)
 *      - budget is APPROVED and not deleted (BUDGET_NOT_APPROVED)
 *      - budgetLine belongs to approved budget of project (INVALID_BUDGET_LINE)
 *      - entry.budgetLineId === lockedLine.id (INVALID_BUDGET_LINE)
 *      - entry.projectId === project.id (INVALID_PROJECT_STATUS)
 *    - Aggregates active exposure for this BudgetLine:
 *      - APPROVED commitments
 *      - APPROVED direct expenses (custodyId IS NULL)
 *      - APPROVED custody expenses (custodyId IS NOT NULL)
 *      - Outstanding custodies (ISSUED / PARTIALLY_SETTLED)
 *      - APPROVED payroll entries
 *      - Excludes SubcontractorBilling (already covered by commitment)
 *      - Excludes current submitted entry from exposure before approval
 *    - Enforces hard ceiling: currentExposure + entry.amount <= BudgetLine.amount
 *      using pure helper checkPayrollBudgetLineCeiling.
 * 5. Immutability trigger: Once APPROVED, payroll entry is strictly immutable ledger record.
 * 6. Atomicity: Status update + approval metadata + PAYROLL_ENTRY_APPROVED AuditLog in SAME transaction.
 */

import {
  BudgetCategory,
  BudgetStatus,
  CommitmentStatus,
  CustodyStatus,
  ExpenseStatus,
  PayrollStatus,
  Prisma,
  ProjectStatus,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { calculateBudgetLineExposure, sumOutstandingCustodyBalances } from '@/lib/custodies/calculations';
import { requireManager } from '@/lib/permissions';
import { validate } from '@/lib/validation';
import { payrollIdSchema } from '@/lib/validation/schemas/payroll';

import { checkPayrollBudgetLineCeiling } from '../calculations';
import { toPayrollSummaryDTO } from '../mappers';
import { getBudgetLinePayrollExposure } from '../queries/get-budget-line-payroll-exposure';
import { assertPayrollCanBeApproved } from '../state-machine';
import type { PayrollEntrySummaryDTO } from '../types';

/**
 * Approves a submitted payroll entry, committing it as realized actual labor spend.
 */
export async function approvePayroll(payrollId: unknown): Promise<PayrollEntrySummaryDTO> {
  // 1. Authorization: Role.MANAGER exclusively
  const actor = await requireManager();

  // 2. Validate payrollId schema
  const idValidation = validate(payrollIdSchema, payrollId);
  if (!idValidation.success) {
    throw new ValidationError(idValidation.errors);
  }
  const id = idValidation.data;

  // 3. Pre-transaction fetch for sanity & separation-of-duties check
  const preCheck = await prisma.payrollEntry.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      createdById: true,
      budgetLineId: true,
      projectId: true,
      amount: true,
      deletedAt: true,
    },
  });

  if (!preCheck) {
    throw new AppError('NOT_FOUND', 'قيد الراتب غير موجود');
  }

  if (preCheck.deletedAt !== null) {
    throw new AppError('RECORD_DELETED', 'لا يمكن اعتماد قيد راتب محذوف');
  }

  // Pre-transaction assertion: approver cannot be the creator
  if (preCheck.createdById === actor.id) {
    throw new AppError(
      'FORBIDDEN_SELF_APPROVAL',
      'لا يمكن للمعتمد اعتماد قيد راتب قام بإنشائه بنفسه (مبدأ فصل المهام)',
    );
  }

  // Pre-transaction assertion: status must be SUBMITTED
  assertPayrollCanBeApproved(preCheck.status);

  // 4. Execute atomic approval transaction with Canonical Lock Hierarchy
  const now = new Date();
  let approved;
  try {
    approved = await prisma.$transaction(async (tx) => {
    // 4.1 Canonical Lock Order 1: Lock the parent BudgetLine row
    const lockedLines = await tx.$queryRaw<
      Array<{
        id: string;
        amount: Prisma.Decimal;
        category: BudgetCategory;
        budgetId: string;
      }>
    >`
      SELECT id, amount, category, "budgetId" FROM budget_lines
      WHERE id = ${preCheck.budgetLineId}
      FOR UPDATE
    `;

    const lockedLine = lockedLines[0];
    if (!lockedLine) {
      throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة غير موجود');
    }

    // Invariant C: BudgetLine category must be LABOR
    if (lockedLine.category !== BudgetCategory.LABOR) {
      throw new AppError(
        'INVALID_BUDGET_LINE_CATEGORY',
        `بند الموازنة يجب أن يكون من فئة الأجور والعمالة (LABOR)، الفئة الحالية: "${lockedLine.category}"`,
      );
    }

    // Invariant E: Project existence and ACTIVE status check
    const project = await tx.project.findFirst({
      where: { id: preCheck.projectId, deletedAt: null },
      select: { id: true, status: true, deletedAt: true },
    });

    if (!project || project.status !== ProjectStatus.ACTIVE || project.deletedAt !== null) {
      throw new AppError('INVALID_PROJECT_STATUS', 'المشروع غير نشط أو تم حذفه');
    }

    // Invariant D: Project must have an APPROVED, non-deleted budget
    const approvedBudget = await tx.budget.findFirst({
      where: {
        projectId: project.id,
        status: BudgetStatus.APPROVED,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!approvedBudget) {
      throw new AppError('BUDGET_NOT_APPROVED', 'المشروع لا يمتلك موازنة معتمدة نشطة');
    }

    // Invariant A & B: BudgetLine must belong to the approved budget of the project
    if (lockedLine.budgetId !== approvedBudget.id) {
      throw new AppError('INVALID_BUDGET_LINE', 'بند الموازنة لا ينتمي للموازنة المعتمدة لنفس المشروع');
    }

    // 4.2 Canonical Lock Order 2: Lock the PayrollEntry row
    const lockedPayrollEntries = await tx.$queryRaw<
      Array<{
        id: string;
        projectId: string;
        budgetLineId: string;
        amount: Prisma.Decimal;
        currency: string;
        periodYear: number;
        periodMonth: number;
        status: PayrollStatus;
        createdById: string;
        deletedAt: Date | null;
      }>
    >`
      SELECT id, "projectId", "budgetLineId", amount, currency, "periodYear", "periodMonth", status, "createdById", "deletedAt"
      FROM payroll_entries
      WHERE id = ${id}
      FOR UPDATE
    `;

    const lockedEntry = lockedPayrollEntries[0];
    if (!lockedEntry) {
      throw new AppError('NOT_FOUND', 'قيد الراتب غير موجود');
    }

    if (lockedEntry.deletedAt !== null) {
      throw new AppError('RECORD_DELETED', 'لا يمكن اعتماد قيد راتب محذوف');
    }

    assertPayrollCanBeApproved(lockedEntry.status);

    // Re-assert separation of duties inside transaction
    if (lockedEntry.createdById === actor.id) {
      throw new AppError(
        'FORBIDDEN_SELF_APPROVAL',
        'لا يمكن للمعتمد اعتماد قيد راتب قام بإنشائه بنفسه (مبدأ فصل المهام)',
      );
    }

    // Linkage consistency checks
    if (lockedEntry.budgetLineId !== lockedLine.id) {
      throw new AppError('INVALID_BUDGET_LINE', 'قيد الراتب غير مرتبط ببند الموازنة المقفل');
    }

    if (lockedEntry.projectId !== project.id) {
      throw new AppError('INVALID_PROJECT_STATUS', 'مشروع قيد الراتب لا يطابق مشروع بند الموازنة');
    }

    // 4.3 Aggregate current active exposure for THIS BudgetLine only
    const [approvedCommitmentsAgg, directExpensesAgg, custodyExpensesAgg, activeCustodies, payrollExposure] =
      await Promise.all([
        tx.commitment.aggregate({
          where: {
            budgetLineId: lockedLine.id,
            status: CommitmentStatus.APPROVED,
            deletedAt: null,
          },
          _sum: { amount: true },
        }),
        tx.expense.aggregate({
          where: {
            budgetLineId: lockedLine.id,
            status: ExpenseStatus.APPROVED,
            custodyId: null,
            deletedAt: null,
          },
          _sum: { amount: true },
        }),
        tx.expense.aggregate({
          where: {
            budgetLineId: lockedLine.id,
            status: ExpenseStatus.APPROVED,
            custodyId: { not: null },
            deletedAt: null,
          },
          _sum: { amount: true },
        }),
        tx.custody.findMany({
          where: {
            budgetLineId: lockedLine.id,
            status: { in: [CustodyStatus.ISSUED, CustodyStatus.PARTIALLY_SETTLED] },
            deletedAt: null,
          },
          include: {
            expenses: {
              where: { status: ExpenseStatus.APPROVED, deletedAt: null },
              select: { amount: true },
            },
          },
        }),
        getBudgetLinePayrollExposure(lockedLine.id, tx),
      ]);

    const approvedCommitments = approvedCommitmentsAgg._sum.amount ?? new Prisma.Decimal('0.00');
    const directActualSpend = directExpensesAgg._sum.amount ?? new Prisma.Decimal('0.00');
    const custodyActualSpend = custodyExpensesAgg._sum.amount ?? new Prisma.Decimal('0.00');
    const approvedPayroll = payrollExposure.approvedPayroll;

    const outstandingCustodies = sumOutstandingCustodyBalances(activeCustodies);

    // Compute canonical total active exposure
    const exposureResult = calculateBudgetLineExposure({
      authorizedAmount: lockedLine.amount,
      approvedCommitments,
      directActualSpend,
      custodyActualSpend,
      outstandingCustodies,
      approvedPayroll,
    });
    const currentTotalActiveExposure = exposureResult.totalActiveExposure;

    // 4.4 Ceiling Check via pure helper checkPayrollBudgetLineCeiling
    const ceilingCheck = checkPayrollBudgetLineCeiling(
      lockedLine.amount,
      currentTotalActiveExposure,
      lockedEntry.amount,
    );

    if (!ceilingCheck.withinCeiling) {
      const remainingAvailable = lockedLine.amount.sub(currentTotalActiveExposure);
      throw new AppError(
        'BUDGET_LINE_EXCEEDED',
        `مبلغ قيد الراتب (${lockedEntry.amount.toFixed(2)} ر.س) يتجاوز الرصيد المتاح لبند الموازنة (${remainingAvailable.toFixed(2)} ر.س)`,
      );
    }

    // 4.5 Update PayrollEntry to APPROVED
    const updatedPayroll = await tx.payrollEntry.update({
      where: { id },
      data: {
        status: PayrollStatus.APPROVED,
        approvedById: actor.id,
        approvedAt: now,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        rejectedBy: { select: { id: true, name: true, email: true } },
        cancelledBy: { select: { id: true, name: true, email: true } },
        budgetLine: { select: { id: true, category: true, description: true, amount: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });

    // 4.6 Write PAYROLL_ENTRY_APPROVED AuditLog in SAME transaction
    const exposureBeforeApproval = currentTotalActiveExposure;
    const exposureAfterApproval = ceilingCheck.newTotalActiveExposure;
    const budgetLineRemaining = ceilingCheck.remainingAvailableBalance;

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'PAYROLL_ENTRY_APPROVED',
        entityType: 'PAYROLL_ENTRY',
        entityId: updatedPayroll.id,
        metadata: {
          payrollEntryId: updatedPayroll.id,
          projectId: updatedPayroll.projectId,
          budgetLineId: updatedPayroll.budgetLineId,
          periodYear: updatedPayroll.periodYear,
          periodMonth: updatedPayroll.periodMonth,
          amount: updatedPayroll.amount.toFixed(2),
          currency: updatedPayroll.currency,
          previousStatus: PayrollStatus.SUBMITTED,
          newStatus: PayrollStatus.APPROVED,
          exposureBeforeApproval: exposureBeforeApproval.toFixed(2),
          exposureAfterApproval: exposureAfterApproval.toFixed(2),
          budgetLineRemaining: budgetLineRemaining.toFixed(2),
          approvedAt: now.toISOString(),
        },
      },
    });

    return updatedPayroll;
  });
} catch (error) {
  if (!(error instanceof AppError)) {
    logger.error('payroll.approval_transaction_failed', {
      payrollId: id,
      actorId: actor.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
  throw error;
}

logger.info('payroll.approved', {
  payrollId: approved.id,
  projectId: approved.projectId,
  budgetLineId: approved.budgetLineId,
  actorId: actor.id,
  amount: approved.amount.toFixed(2),
});

return toPayrollSummaryDTO(approved);
}

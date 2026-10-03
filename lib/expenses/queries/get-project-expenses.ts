/**
 * lib/expenses/queries/get-project-expenses.ts
 *
 * Query: Fetches all expenses and complete budget-line spend breakdown for a project.
 *
 * Enforces:
 * 1. Authorization: Role.MANAGER, Role.ENGINEER, or Role.ACCOUNTANT.
 * 2. Exact Decimal calculation of spend metrics (Gates 9, 22, 23, 24, 34, 35):
 *    - authorizedAmount: BudgetLine.amount
 *    - actualSpend: SUM(APPROVED)
 *    - pendingExposure: SUM(SUBMITTED)
 *    - availableBalance: authorizedAmount - actualSpend
 *    - projectedBalance: availableBalance - pendingExposure
 * 3. Soft-delete filter: Only records with deletedAt === null are included.
 */

import {
  BudgetStatus,
  CommitmentStatus,
  CustodyStatus,
  ExpenseStatus,
  PayrollStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';
import { calculateBudgetLineExposure } from '@/lib/budget/calculations';
import { sumOutstandingCustodyBalances } from '@/lib/custodies';

import { toExpenseSummaryDTO } from '../mappers';
import type { BudgetLineSpendDTO, ProjectExpensesOverviewDTO } from '../types';

export async function getProjectExpenses(
  projectId: string,
): Promise<ProjectExpensesOverviewDTO> {
  const actor = await requireAuth();
  if (!policies.canViewExpenses(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض مصروفات المشروع');
  }

  // 1. Fetch project
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true, code: true, status: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  // 2. Fetch project's approved active budget with lines
  const approvedBudget = await prisma.budget.findFirst({
    where: {
      projectId,
      status: BudgetStatus.APPROVED,
      deletedAt: null,
    },
    include: {
      lines: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  // 3. Fetch all non-deleted expenses for this project
  const expenses = await prisma.expense.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    include: {
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      project: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 4. Fetch non-deleted commitments for joint exposure
  const commitments = await prisma.commitment.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      budgetLineId: true,
      amount: true,
      status: true,
    },
  });

  // 5. Fetch non-deleted custodies for joint outstanding advance exposure
  const custodies = await prisma.custody.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      budgetLineId: true,
      amount: true,
      cashReturnedAmount: true,
      status: true,
      expenses: {
        where: { deletedAt: null },
        select: { id: true, amount: true, status: true },
      },
    },
  });

  // 6. Fetch non-deleted payroll entries for joint labor exposure
  const payrollEntries = await prisma.payrollEntry.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      budgetLineId: true,
      amount: true,
      status: true,
    },
  });

  // 7. Calculate spend metrics per budget line using canonical calculateBudgetLineExposure
  const linesMetrics = (approvedBudget?.lines ?? []).map((line) => {
    const lineExpenses = expenses.filter((e) => e.budgetLineId === line.id);
    const lineCommitments = commitments.filter((c) => c.budgetLineId === line.id);
    const lineCustodies = custodies.filter((c) => c.budgetLineId === line.id);
    const linePayroll = payrollEntries.filter((p) => p.budgetLineId === line.id);

    const approvedCommitments = lineCommitments
      .filter((c) => c.status === CommitmentStatus.APPROVED)
      .reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal('0.00'));

    const directActualSpend = lineExpenses
      .filter((e) => e.status === ExpenseStatus.APPROVED && e.custodyId === null)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    const custodyActualSpend = lineExpenses
      .filter((e) => e.status === ExpenseStatus.APPROVED && e.custodyId !== null)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    const outstandingCustodies = sumOutstandingCustodyBalances(lineCustodies);

    const approvedPayroll = linePayroll
      .filter((p) => p.status === PayrollStatus.APPROVED)
      .reduce((acc, p) => acc.add(p.amount), new Prisma.Decimal('0.00'));

    const pendingCommitments = lineCommitments
      .filter((c) => c.status === CommitmentStatus.SUBMITTED)
      .reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal('0.00'));

    const pendingDirectExpenses = lineExpenses
      .filter((e) => e.status === ExpenseStatus.SUBMITTED && e.custodyId === null)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    const pendingCustodies = lineCustodies
      .filter((c) => c.status === CustodyStatus.SUBMITTED)
      .reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal('0.00'));

    const pendingPayroll = linePayroll
      .filter((p) => p.status === PayrollStatus.SUBMITTED)
      .reduce((acc, p) => acc.add(p.amount), new Prisma.Decimal('0.00'));

    const metrics = calculateBudgetLineExposure({
      authorizedAmount: line.amount,
      approvedCommitments,
      directActualSpend,
      custodyActualSpend,
      outstandingCustodies,
      approvedPayroll,
      pendingCommitments,
      pendingDirectExpenses,
      pendingCustodies,
      pendingPayroll,
    });

    const dto: BudgetLineSpendDTO = {
      budgetLineId: line.id,
      category: line.category,
      description: line.description,
      authorizedAmount: metrics.authorizedAmount.toFixed(2),
      actualSpend: metrics.approvedExpenses.toFixed(2),
      pendingExposure: metrics.totalPendingExposure.toFixed(2),
      availableBalance: metrics.availableBalance.toFixed(2),
      projectedBalance: metrics.projectedBalance.toFixed(2),
    };

    return {
      dto,
      metrics,
    };
  });

  // 8. Calculate overall project totals from canonical line metrics
  let totalAuthorizedBudget = new Prisma.Decimal('0.00');
  let totalActualSpend = new Prisma.Decimal('0.00');
  let totalPendingExposure = new Prisma.Decimal('0.00');
  let totalAvailableBalance = new Prisma.Decimal('0.00');
  let totalProjectedBalance = new Prisma.Decimal('0.00');

  for (const item of linesMetrics) {
    totalAuthorizedBudget = totalAuthorizedBudget.add(item.metrics.authorizedAmount);
    totalActualSpend = totalActualSpend.add(item.metrics.approvedExpenses);
    totalPendingExposure = totalPendingExposure.add(item.metrics.totalPendingExposure);
    totalAvailableBalance = totalAvailableBalance.add(item.metrics.availableBalance);
    totalProjectedBalance = totalProjectedBalance.add(item.metrics.projectedBalance);
  }

  return {
    projectId: project.id,
    projectName: project.name,
    projectCode: project.code,
    totalAuthorizedBudget: totalAuthorizedBudget.toFixed(2),
    totalActualSpend: totalActualSpend.toFixed(2),
    totalPendingExposure: totalPendingExposure.toFixed(2),
    totalAvailableBalance: totalAvailableBalance.toFixed(2),
    totalProjectedBalance: totalProjectedBalance.toFixed(2),
    lines: linesMetrics.map((m) => m.dto),
    expenses: expenses.map(toExpenseSummaryDTO),
  };
}

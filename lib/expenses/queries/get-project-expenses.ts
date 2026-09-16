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

import { BudgetStatus, ExpenseStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

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

  // 4. Calculate spend metrics per budget line using exact Decimal arithmetic
  const linesBreakdown: BudgetLineSpendDTO[] = (approvedBudget?.lines ?? []).map((line) => {
    const lineExpenses = expenses.filter((e) => e.budgetLineId === line.id);

    const actualSpend = lineExpenses
      .filter((e) => e.status === ExpenseStatus.APPROVED)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    const pendingExposure = lineExpenses
      .filter((e) => e.status === ExpenseStatus.SUBMITTED)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    const availableBalance = line.amount.sub(actualSpend);
    const projectedBalance = availableBalance.sub(pendingExposure);

    return {
      budgetLineId: line.id,
      category: line.category,
      description: line.description,
      authorizedAmount: line.amount.toFixed(2),
      actualSpend: actualSpend.toFixed(2),
      pendingExposure: pendingExposure.toFixed(2),
      availableBalance: availableBalance.toFixed(2),
      projectedBalance: projectedBalance.toFixed(2),
    };
  });

  // 5. Calculate overall project totals
  const totalAuthorizedBudget = (approvedBudget?.lines ?? []).reduce(
    (acc, l) => acc.add(l.amount),
    new Prisma.Decimal('0.00'),
  );

  const totalActualSpend = expenses
    .filter((e) => e.status === ExpenseStatus.APPROVED)
    .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

  const totalPendingExposure = expenses
    .filter((e) => e.status === ExpenseStatus.SUBMITTED)
    .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

  const totalAvailableBalance = totalAuthorizedBudget.sub(totalActualSpend);
  const totalProjectedBalance = totalAvailableBalance.sub(totalPendingExposure);

  return {
    projectId: project.id,
    projectName: project.name,
    projectCode: project.code,
    totalAuthorizedBudget: totalAuthorizedBudget.toFixed(2),
    totalActualSpend: totalActualSpend.toFixed(2),
    totalPendingExposure: totalPendingExposure.toFixed(2),
    totalAvailableBalance: totalAvailableBalance.toFixed(2),
    totalProjectedBalance: totalProjectedBalance.toFixed(2),
    lines: linesBreakdown,
    expenses: expenses.map(toExpenseSummaryDTO),
  };
}

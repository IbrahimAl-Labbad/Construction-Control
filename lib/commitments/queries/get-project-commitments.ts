/**
 * lib/commitments/queries/get-project-commitments.ts
 *
 * Query: Fetches all commitments and complete budget-line commitment & exposure breakdown for a project.
 *
 * Strictly enforces Mandatory Correction 1:
 * - TotalExposure = ApprovedCommitments + ApprovedExpenses
 * - AvailableBalance = BudgetLine.amount - TotalExposure
 * - PendingCommitmentExposure = SUM(SUBMITTED commitments)
 * - PendingExpenseExposure = SUM(SUBMITTED expenses)
 * - TotalPendingExposure = PendingCommitmentExposure + PendingExpenseExposure
 * - ProjectedBalance = AvailableBalance - TotalPendingExposure
 *
 * All arithmetic uses exact Prisma.Decimal.
 * Soft-delete filter: only records with deletedAt === null are included.
 */

import { BudgetStatus, CommitmentStatus, ExpenseStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/permissions';
import { policies } from '@/lib/permissions/policies';

import { toCommitmentSummaryDTO } from '../mappers';
import type {
  BudgetLineCommitmentSpendDTO,
  ProjectCommitmentsOverviewDTO,
} from '../types';

export async function getProjectCommitments(
  projectId: string,
): Promise<ProjectCommitmentsOverviewDTO> {
  const actor = await requireAuth();
  if (!policies.canViewCommitments(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض التزامات المشروع');
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

  // 3. Fetch all non-deleted commitments for this project
  const commitments = await prisma.commitment.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      project: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 4. Fetch all non-deleted expenses for this project (needed for joint exposure & pending calculations)
  const expenses = await prisma.expense.findMany({
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

  // 5. Calculate exposure metrics per budget line using exact Decimal arithmetic (Correction 1)
  const linesBreakdown: BudgetLineCommitmentSpendDTO[] = (approvedBudget?.lines ?? []).map((line) => {
    const lineCommitments = commitments.filter((c) => c.budgetLineId === line.id);
    const lineExpenses = expenses.filter((e) => e.budgetLineId === line.id);

    // Realized spend (Expenses)
    const approvedExpenses = lineExpenses
      .filter((e) => e.status === ExpenseStatus.APPROVED)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    // Approved commitments
    const approvedCommitments = lineCommitments
      .filter((c) => c.status === CommitmentStatus.APPROVED)
      .reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal('0.00'));

    // Total Exposure = ApprovedExpenses + ApprovedCommitments
    const totalExposure = approvedExpenses.add(approvedCommitments);

    // Available Balance = BudgetLine.amount - TotalExposure
    const availableBalance = line.amount.sub(totalExposure);

    // Pending Exposures
    const pendingCommitmentExposure = lineCommitments
      .filter((c) => c.status === CommitmentStatus.SUBMITTED)
      .reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal('0.00'));

    const pendingExpenseExposure = lineExpenses
      .filter((e) => e.status === ExpenseStatus.SUBMITTED)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    const totalPendingExposure = pendingCommitmentExposure.add(pendingExpenseExposure);

    // Projected Balance = AvailableBalance - TotalPendingExposure
    const projectedBalance = availableBalance.sub(totalPendingExposure);

    return {
      budgetLineId: line.id,
      category: line.category,
      description: line.description,
      authorizedAmount: line.amount.toFixed(2),
      approvedExpenses: approvedExpenses.toFixed(2),
      approvedCommitments: approvedCommitments.toFixed(2),
      totalExposure: totalExposure.toFixed(2),
      availableBalance: availableBalance.toFixed(2),
      pendingCommitmentExposure: pendingCommitmentExposure.toFixed(2),
      pendingExpenseExposure: pendingExpenseExposure.toFixed(2),
      totalPendingExposure: totalPendingExposure.toFixed(2),
      projectedBalance: projectedBalance.toFixed(2),
    };
  });

  // 6. Calculate overall project totals
  const totalAuthorizedBudget = (approvedBudget?.lines ?? []).reduce(
    (acc, l) => acc.add(l.amount),
    new Prisma.Decimal('0.00'),
  );

  const totalApprovedExpenses = expenses
    .filter((e) => e.status === ExpenseStatus.APPROVED)
    .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

  const totalApprovedCommitments = commitments
    .filter((c) => c.status === CommitmentStatus.APPROVED)
    .reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal('0.00'));

  const totalExposure = totalApprovedExpenses.add(totalApprovedCommitments);
  const totalAvailableBalance = totalAuthorizedBudget.sub(totalExposure);

  const totalPendingCommitmentExposure = commitments
    .filter((c) => c.status === CommitmentStatus.SUBMITTED)
    .reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal('0.00'));

  const totalPendingExpenseExposure = expenses
    .filter((e) => e.status === ExpenseStatus.SUBMITTED)
    .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

  const totalPendingExposure = totalPendingCommitmentExposure.add(totalPendingExpenseExposure);
  const totalProjectedBalance = totalAvailableBalance.sub(totalPendingExposure);

  return {
    projectId: project.id,
    projectName: project.name,
    projectCode: project.code,
    totalAuthorizedBudget: totalAuthorizedBudget.toFixed(2),
    totalApprovedExpenses: totalApprovedExpenses.toFixed(2),
    totalApprovedCommitments: totalApprovedCommitments.toFixed(2),
    totalExposure: totalExposure.toFixed(2),
    totalAvailableBalance: totalAvailableBalance.toFixed(2),
    totalPendingCommitmentExposure: totalPendingCommitmentExposure.toFixed(2),
    totalPendingExpenseExposure: totalPendingExpenseExposure.toFixed(2),
    totalPendingExposure: totalPendingExposure.toFixed(2),
    totalProjectedBalance: totalProjectedBalance.toFixed(2),
    lines: linesBreakdown,
    commitments: commitments.map(toCommitmentSummaryDTO),
  };
}

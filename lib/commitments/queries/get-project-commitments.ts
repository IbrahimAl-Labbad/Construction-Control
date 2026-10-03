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

  // 4. Fetch non-deleted expenses for this project (distinguishing direct vs custody-linked spend)
  const expenses = await prisma.expense.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      budgetLineId: true,
      custodyId: true,
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

  // 7. Calculate exposure metrics per budget line using canonical calculateBudgetLineExposure
  const linesMetrics = (approvedBudget?.lines ?? []).map((line) => {
    const lineCommitments = commitments.filter((c) => c.budgetLineId === line.id);
    const lineExpenses = expenses.filter((e) => e.budgetLineId === line.id);
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

    const pendingCommitmentExposure = lineCommitments
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
      pendingCommitments: pendingCommitmentExposure,
      pendingDirectExpenses,
      pendingCustodies,
      pendingPayroll,
    });

    const pendingExpenseExposure = lineExpenses
      .filter((e) => e.status === ExpenseStatus.SUBMITTED)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    const dto: BudgetLineCommitmentSpendDTO = {
      budgetLineId: line.id,
      category: line.category,
      description: line.description,
      authorizedAmount: metrics.authorizedAmount.toFixed(2),
      approvedExpenses: metrics.approvedExpenses.toFixed(2),
      approvedCommitments: metrics.approvedCommitments.toFixed(2),
      totalExposure: metrics.totalActiveExposure.toFixed(2),
      availableBalance: metrics.availableBalance.toFixed(2),
      pendingCommitmentExposure: pendingCommitmentExposure.toFixed(2),
      pendingExpenseExposure: pendingExpenseExposure.toFixed(2),
      totalPendingExposure: metrics.totalPendingExposure.toFixed(2),
      projectedBalance: metrics.projectedBalance.toFixed(2),
    };

    return {
      dto,
      metrics,
      pendingCommitmentExposure,
      pendingExpenseExposure,
    };
  });

  // 8. Calculate overall project totals from canonical line metrics
  let totalAuthorizedBudget = new Prisma.Decimal('0.00');
  let totalApprovedExpenses = new Prisma.Decimal('0.00');
  let totalApprovedCommitments = new Prisma.Decimal('0.00');
  let totalExposure = new Prisma.Decimal('0.00');
  let totalAvailableBalance = new Prisma.Decimal('0.00');
  let totalPendingCommitmentExposure = new Prisma.Decimal('0.00');
  let totalPendingExpenseExposure = new Prisma.Decimal('0.00');
  let totalPendingExposure = new Prisma.Decimal('0.00');
  let totalProjectedBalance = new Prisma.Decimal('0.00');

  for (const item of linesMetrics) {
    totalAuthorizedBudget = totalAuthorizedBudget.add(item.metrics.authorizedAmount);
    totalApprovedExpenses = totalApprovedExpenses.add(item.metrics.approvedExpenses);
    totalApprovedCommitments = totalApprovedCommitments.add(item.metrics.approvedCommitments);
    totalExposure = totalExposure.add(item.metrics.totalActiveExposure);
    totalAvailableBalance = totalAvailableBalance.add(item.metrics.availableBalance);
    totalPendingCommitmentExposure = totalPendingCommitmentExposure.add(item.pendingCommitmentExposure);
    totalPendingExpenseExposure = totalPendingExpenseExposure.add(item.pendingExpenseExposure);
    totalPendingExposure = totalPendingExposure.add(item.metrics.totalPendingExposure);
    totalProjectedBalance = totalProjectedBalance.add(item.metrics.projectedBalance);
  }

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
    lines: linesMetrics.map((m) => m.dto),
    commitments: commitments.map(toCommitmentSummaryDTO),
  };
}

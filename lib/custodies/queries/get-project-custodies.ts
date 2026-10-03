/**
 * lib/custodies/queries/get-project-custodies.ts
 *
 * Query: Fetches all custodies and complete BudgetLine exposure breakdown for a project.
 *
 * Enforces Zero Double-Counting:
 * - TotalActiveExposure = ApprovedCommitments + DirectActualSpend + CustodyActualSpend + OutstandingCustodies
 * - AvailableBalance = BudgetLine.amount - TotalActiveExposure
 * - PendingCustodies = SUM(SUBMITTED custodies)
 * - TotalPendingExposure = PendingCommitments + PendingDirectExpenses + PendingCustodies
 * - ProjectedBalance = AvailableBalance - TotalPendingExposure
 *
 * All arithmetic uses exact Prisma.Decimal. Soft-deleted records are strictly excluded.
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

import { calculateBudgetLineExposure, sumOutstandingCustodyBalances } from '../calculations';
import { toCustodySummaryDTO } from '../mappers';
import type {
  BudgetLineCustodySpendDTO,
  ProjectCustodiesOverviewDTO,
} from '../types';

export async function getProjectCustodies(
  projectId: string,
): Promise<ProjectCustodiesOverviewDTO> {
  const actor = await requireAuth();
  if (!policies.canViewCustodies(actor)) {
    throw new AppError('FORBIDDEN', 'غير مصرح لك بعرض عهد المشروع');
  }

  // 1. Fetch project
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true, code: true, status: true },
  });

  if (!project) {
    throw new AppError('NOT_FOUND', 'المشروع غير موجود');
  }

  // 2. Fetch approved budget with lines
  const approvedBudget = await prisma.budget.findFirst({
    where: {
      projectId,
      status: BudgetStatus.APPROVED,
      deletedAt: null,
    },
    include: {
      lines: {
        orderBy: { category: 'asc' },
      },
    },
  });

  // 3. Fetch all non-deleted custodies for this project
  const custodies = await prisma.custody.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
      issuedBy: { select: { id: true, name: true, email: true } },
      closedBy: { select: { id: true, name: true, email: true } },
      custodian: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true, code: true } },
      budgetLine: { select: { id: true, category: true, description: true, amount: true } },
      expenses: {
        where: { deletedAt: null },
        select: { id: true, amount: true, status: true, deletedAt: true },
      },
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

  // 5. Fetch non-deleted expenses for joint exposure
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

  // 5.1 Fetch non-deleted payroll entries for joint exposure (Vertical Slice 8)
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

  // 6. Calculate exposure metrics per budget line
  const linesMetrics = (approvedBudget?.lines ?? []).map((line) => {
    const lineCommitments = commitments.filter((c) => c.budgetLineId === line.id);
    const lineExpenses = expenses.filter((e) => e.budgetLineId === line.id);
    const lineCustodies = custodies.filter((c) => c.budgetLineId === line.id);
    const linePayroll = payrollEntries.filter((p) => p.budgetLineId === line.id);

    // Approved commitments
    const approvedCommitments = lineCommitments
      .filter((c) => c.status === CommitmentStatus.APPROVED)
      .reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal('0.00'));

    // Direct actual spend (no custody)
    const directActualSpend = lineExpenses
      .filter((e) => e.status === ExpenseStatus.APPROVED && e.custodyId === null)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    // Custody actual spend (custody linked)
    const custodyActualSpend = lineExpenses
      .filter((e) => e.status === ExpenseStatus.APPROVED && e.custodyId !== null)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    // Outstanding Custodies (active cash in field)
    const outstandingCustodies = sumOutstandingCustodyBalances(lineCustodies);

    // Approved payroll (Vertical Slice 8)
    const approvedPayroll = linePayroll
      .filter((p) => p.status === PayrollStatus.APPROVED)
      .reduce((acc, p) => acc.add(p.amount), new Prisma.Decimal('0.00'));

    // Pending metrics
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

    const dto: BudgetLineCustodySpendDTO = {
      budgetLineId: line.id,
      category: line.category,
      description: line.description,
      authorizedAmount: metrics.authorizedAmount.toFixed(2),
      approvedExpenses: metrics.approvedExpenses.toFixed(2),
      approvedCommitments: metrics.approvedCommitments.toFixed(2),
      outstandingCustodies: metrics.outstandingCustodies.toFixed(2),
      totalActiveExposure: metrics.totalActiveExposure.toFixed(2),
      availableBalance: metrics.availableBalance.toFixed(2),
      pendingCustodies: metrics.pendingCustodies.toFixed(2),
      totalPendingExposure: metrics.totalPendingExposure.toFixed(2),
      projectedBalance: metrics.projectedBalance.toFixed(2),
    };

    return {
      dto,
      metrics,
    };
  });

  // 7. Calculate overall project totals from canonical line metrics (D2 bug fix: includes payroll)
  let totalAuthorizedBudget = new Prisma.Decimal('0.00');
  let totalApprovedExpenses = new Prisma.Decimal('0.00');
  let totalApprovedCommitments = new Prisma.Decimal('0.00');
  let totalOutstandingCustodies = new Prisma.Decimal('0.00');
  let totalActiveExposure = new Prisma.Decimal('0.00');
  let totalAvailableBalance = new Prisma.Decimal('0.00');
  let totalPendingExposure = new Prisma.Decimal('0.00');
  let totalProjectedBalance = new Prisma.Decimal('0.00');

  for (const item of linesMetrics) {
    totalAuthorizedBudget = totalAuthorizedBudget.add(item.metrics.authorizedAmount);
    totalApprovedExpenses = totalApprovedExpenses.add(item.metrics.approvedExpenses);
    totalApprovedCommitments = totalApprovedCommitments.add(item.metrics.approvedCommitments);
    totalOutstandingCustodies = totalOutstandingCustodies.add(item.metrics.outstandingCustodies);
    totalActiveExposure = totalActiveExposure.add(item.metrics.totalActiveExposure);
    totalAvailableBalance = totalAvailableBalance.add(item.metrics.availableBalance);
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
    totalOutstandingCustodies: totalOutstandingCustodies.toFixed(2),
    totalActiveExposure: totalActiveExposure.toFixed(2),
    totalAvailableBalance: totalAvailableBalance.toFixed(2),
    totalPendingExposure: totalPendingExposure.toFixed(2),
    totalProjectedBalance: totalProjectedBalance.toFixed(2),
    lines: linesMetrics.map((m) => m.dto),
    custodies: custodies.map(toCustodySummaryDTO),
  };
}

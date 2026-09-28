/**
 * lib/operational-dashboard/queries/get-project-operational-financial-summary.ts
 *
 * Dedicated read model: Computes the 6 canonical financial metrics for a single project.
 * Vertical Slice 13 — Operational Project Dashboard.
 *
 * Strict Architectural Invariants (BD-13-07, BD-13-15, BD-13-18, AGENTS.md §13):
 * - Complete Financial Ownership: Owns approved budget lookup, zero-line guard,
 *   parallel batch aggregation, and canonical calculations.
 * - Zero Financial Queries in Top-Level Orchestrator.
 * - Canonical Primitives:
 *   - calculateCustodyBalances() from lib/custodies/calculations.ts for active custodies.
 *   - calculateBudgetLineExposure() from lib/custodies/calculations.ts for line exposure.
 *   - getPayrollExposureBatch() from lib/payroll/queries/get-payroll-exposure-batch.ts.
 * - Exact Decimal Arithmetic: Prisma.Decimal only. Zero Number or float arithmetic.
 * - Exposure Invariant: Pending amounts NEVER enter TotalActiveExposure.
 * - Payroll Invariant: Counted exactly once via getPayrollExposureBatch().
 * - Billing Invariant: Subcontractor billing amounts NEVER queried or included.
 */

import {
  BudgetStatus,
  CommitmentStatus,
  CustodyStatus,
  ExpenseStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  calculateBudgetLineExposure,
  calculateCustodyBalances,
} from '@/lib/custodies/calculations';
import { getPayrollExposureBatch } from '@/lib/payroll/queries/get-payroll-exposure-batch';
import type { ProjectOperationalFinancialDTO } from '../types';

/**
 * Builds an O(1) lookup Map from grouped decimal aggregate query results.
 */
function buildDecimalMap(
  aggregates: Array<{ budgetLineId: string; _sum: { amount: Prisma.Decimal | null } }>,
): Map<string, Prisma.Decimal> {
  const zero = new Prisma.Decimal('0.00');
  return new Map(aggregates.map((row) => [row.budgetLineId, row._sum.amount ?? zero]));
}

/**
 * Computes the operational financial summary for a project.
 *
 * @param projectId - The project CUID
 * @returns ProjectOperationalFinancialDTO with all 6 canonical metrics formatted as strings
 */
export async function getProjectOperationalFinancialSummary(
  projectId: string,
): Promise<ProjectOperationalFinancialDTO> {
  const zero = new Prisma.Decimal('0.00');

  // ---------------------------------------------------------------------------
  // Step E1: Fetch the single active APPROVED budget and its lines
  // ---------------------------------------------------------------------------
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      budgets: {
        where: { status: BudgetStatus.APPROVED, deletedAt: null },
        orderBy: { version: 'desc' },
        take: 1,
        select: {
          id: true,
          lines: {
            select: { id: true, amount: true },
          },
        },
      },
    },
  });

  const approvedBudget = project?.budgets[0];

  // Case A: No approved budget exists
  if (!approvedBudget) {
    return {
      hasApprovedBudget: false,
      authorizedBudget: '0.00',
      actualSpend: '0.00',
      totalActiveExposure: '0.00',
      availableBalance: '0.00',
      pendingExposure: '0.00',
      projectedBalance: '0.00',
      currency: 'SAR',
    };
  }

  const lineIds = approvedBudget.lines.map((l) => l.id);

  // Case B: Approved budget exists but has zero lines
  if (lineIds.length === 0) {
    return {
      hasApprovedBudget: true,
      authorizedBudget: '0.00',
      actualSpend: '0.00',
      totalActiveExposure: '0.00',
      availableBalance: '0.00',
      pendingExposure: '0.00',
      projectedBalance: '0.00',
      currency: 'SAR',
    };
  }

  // ---------------------------------------------------------------------------
  // Step E2: Dependent Financial Batch via Promise.all across verified lineIds
  // ---------------------------------------------------------------------------
  const [
    approvedCommitmentsAgg,
    pendingCommitmentsAgg,
    directApprovedExpensesAgg,
    custodyApprovedExpensesAgg,
    pendingDirectExpensesAgg,
    pendingCustodiesAgg,
    activeCustodies,
    payrollBatchMap,
  ] = await Promise.all([
    // E2.1: Approved commitments
    prisma.commitment.groupBy({
      by: ['budgetLineId'],
      where: {
        budgetLineId: { in: lineIds },
        status: CommitmentStatus.APPROVED,
        deletedAt: null,
      },
      _sum: { amount: true },
    }),

    // E2.2: Pending (SUBMITTED) commitments
    prisma.commitment.groupBy({
      by: ['budgetLineId'],
      where: {
        budgetLineId: { in: lineIds },
        status: CommitmentStatus.SUBMITTED,
        deletedAt: null,
      },
      _sum: { amount: true },
    }),

    // E2.3: Approved direct expenses (custodyId === null)
    prisma.expense.groupBy({
      by: ['budgetLineId'],
      where: {
        budgetLineId: { in: lineIds },
        status: ExpenseStatus.APPROVED,
        custodyId: null,
        deletedAt: null,
      },
      _sum: { amount: true },
    }),

    // E2.4: Approved custody-linked expenses (custodyId !== null)
    prisma.expense.groupBy({
      by: ['budgetLineId'],
      where: {
        budgetLineId: { in: lineIds },
        status: ExpenseStatus.APPROVED,
        custodyId: { not: null },
        deletedAt: null,
      },
      _sum: { amount: true },
    }),

    // E2.5: Pending direct expenses (SUBMITTED, custodyId === null)
    prisma.expense.groupBy({
      by: ['budgetLineId'],
      where: {
        budgetLineId: { in: lineIds },
        status: ExpenseStatus.SUBMITTED,
        custodyId: null,
        deletedAt: null,
      },
      _sum: { amount: true },
    }),

    // E2.6: Pending custodies (SUBMITTED) — field is amount
    prisma.custody.groupBy({
      by: ['budgetLineId'],
      where: {
        budgetLineId: { in: lineIds },
        status: CustodyStatus.SUBMITTED,
        deletedAt: null,
      },
      _sum: { amount: true },
    }),

    // E2.7: Active custodies for canonical outstanding balance calculation
    prisma.custody.findMany({
      where: {
        budgetLineId: { in: lineIds },
        status: { in: [CustodyStatus.ISSUED, CustodyStatus.PARTIALLY_SETTLED] },
        deletedAt: null,
      },
      select: {
        budgetLineId: true,
        amount: true,
        cashReturnedAmount: true,
        expenses: {
          where: { status: ExpenseStatus.APPROVED, deletedAt: null },
          select: { amount: true },
        },
      },
    }),

    // E2.8-9: Shared payroll exposure batch (2 internal groupBy queries)
    getPayrollExposureBatch(lineIds),
  ]);

  // ---------------------------------------------------------------------------
  // Step E3: Build O(1) Maps & Canonical Calculations
  // ---------------------------------------------------------------------------
  const approvedCommitmentsMap = buildDecimalMap(approvedCommitmentsAgg);
  const pendingCommitmentsMap = buildDecimalMap(pendingCommitmentsAgg);
  const directApprovedMap = buildDecimalMap(directApprovedExpensesAgg);
  const custodyApprovedMap = buildDecimalMap(custodyApprovedExpensesAgg);
  const pendingDirectExpensesMap = buildDecimalMap(pendingDirectExpensesAgg);
  const pendingCustodiesMap = buildDecimalMap(pendingCustodiesAgg);

  // Canonical Outstanding Custody aggregation per budget line
  const outstandingCustodyMap = new Map<string, Prisma.Decimal>();
  for (const custody of activeCustodies) {
    const settledExpenses = custody.expenses.reduce(
      (sum, exp) => sum.add(exp.amount),
      zero,
    );
    const balances = calculateCustodyBalances({
      amount: custody.amount,
      settledExpenses,
      cashReturned: custody.cashReturnedAmount,
    });
    const current = outstandingCustodyMap.get(custody.budgetLineId) ?? zero;
    outstandingCustodyMap.set(
      custody.budgetLineId,
      current.add(balances.remainingBalance),
    );
  }

  // ---------------------------------------------------------------------------
  // Step E4: Accumulate Project-Level Totals using calculateBudgetLineExposure()
  // ---------------------------------------------------------------------------
  let totalAuthorizedBudget = zero;
  let totalActualSpend = zero;
  let totalActiveExposure = zero;
  let totalAvailableBalance = zero;
  let totalPendingExposure = zero;
  let totalProjectedBalance = zero;

  for (const line of approvedBudget.lines) {
    const payroll = payrollBatchMap.get(line.id);

    const lineExposure = calculateBudgetLineExposure({
      authorizedAmount: line.amount,
      approvedCommitments: approvedCommitmentsMap.get(line.id) ?? zero,
      directActualSpend: directApprovedMap.get(line.id) ?? zero,
      custodyActualSpend: custodyApprovedMap.get(line.id) ?? zero,
      outstandingCustodies: outstandingCustodyMap.get(line.id) ?? zero,
      approvedPayroll: payroll?.approvedPayroll ?? zero,
      pendingCommitments: pendingCommitmentsMap.get(line.id) ?? zero,
      pendingDirectExpenses: pendingDirectExpensesMap.get(line.id) ?? zero,
      pendingCustodies: pendingCustodiesMap.get(line.id) ?? zero,
      pendingPayroll: payroll?.pendingPayroll ?? zero,
    });

    totalAuthorizedBudget = totalAuthorizedBudget.add(lineExposure.authorizedAmount);
    // ActualSpend = approvedExpenses (direct + custody) + approvedPayroll
    totalActualSpend = totalActualSpend
      .add(lineExposure.approvedExpenses)
      .add(lineExposure.approvedPayroll);
    totalActiveExposure = totalActiveExposure.add(lineExposure.totalActiveExposure);
    totalAvailableBalance = totalAvailableBalance.add(lineExposure.availableBalance);
    totalPendingExposure = totalPendingExposure.add(lineExposure.totalPendingExposure);
    totalProjectedBalance = totalProjectedBalance.add(lineExposure.projectedBalance);
  }

  return {
    hasApprovedBudget: true,
    authorizedBudget: totalAuthorizedBudget.toFixed(2),
    actualSpend: totalActualSpend.toFixed(2),
    totalActiveExposure: totalActiveExposure.toFixed(2),
    availableBalance: totalAvailableBalance.toFixed(2),
    pendingExposure: totalPendingExposure.toFixed(2),
    projectedBalance: totalProjectedBalance.toFixed(2),
    currency: 'SAR',
  };
}

/**
 * lib/payroll/queries/get-budget-line-payroll-exposure.ts
 *
 * Minimal financial query to aggregate approved and pending payroll amounts
 * for a specific BudgetLine or Project to supply canonical exposure calculations.
 *
 * Adheres to AGENTS.md §13 (exact Decimal arithmetic) and §14 (no hard deletes: deletedAt = null).
 */

import { prisma } from '@/lib/db/prisma';
import { PayrollStatus, Prisma } from '@prisma/client';

export type BudgetLinePayrollExposureResult = {
  budgetLineId: string;
  approvedPayroll: Prisma.Decimal;
  pendingPayroll: Prisma.Decimal;
};

/**
 * Aggregates approved and pending payroll totals for a single BudgetLine.
 * Supports passing an active transaction client (tx) for atomic approval locking.
 */
export async function getBudgetLinePayrollExposure(
  budgetLineId: string,
  tx?: Prisma.TransactionClient,
): Promise<BudgetLinePayrollExposureResult> {
  const client = tx ?? prisma;
  const zero = new Prisma.Decimal('0.00');

  const [approvedAgg, pendingAgg] = await Promise.all([
    client.payrollEntry.aggregate({
      where: {
        budgetLineId,
        status: PayrollStatus.APPROVED,
        deletedAt: null,
      },
      _sum: { amount: true },
    }),
    client.payrollEntry.aggregate({
      where: {
        budgetLineId,
        status: PayrollStatus.SUBMITTED,
        deletedAt: null,
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    budgetLineId,
    approvedPayroll: approvedAgg._sum.amount ?? zero,
    pendingPayroll: pendingAgg._sum.amount ?? zero,
  };
}

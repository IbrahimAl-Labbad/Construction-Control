/**
 * lib/payroll/queries/get-budget-line-payroll-exposure.ts
 *
 * Minimal financial query to aggregate approved and pending payroll amounts
 * for a specific BudgetLine or Project to supply canonical exposure calculations.
 *
 * Adheres to AGENTS.md §13 (exact Decimal arithmetic) and §14 (no hard deletes: deletedAt = null).
 *
 * Vertical Slice 9 refactor: internally delegates to getPayrollExposureBatch()
 * to share the single canonical payroll aggregation implementation.
 * Public signature, return type, and business semantics are UNCHANGED.
 * All existing Slice 8 callers (get-project-labor-summary.ts, approve-payroll.ts, etc.)
 * remain fully compatible without modification.
 */

import { Prisma } from '@prisma/client';

import { getPayrollExposureBatch } from './get-payroll-exposure-batch';

export type BudgetLinePayrollExposureResult = {
  budgetLineId: string;
  approvedPayroll: Prisma.Decimal;
  pendingPayroll: Prisma.Decimal;
};

/**
 * Aggregates approved and pending payroll totals for a single BudgetLine.
 * Supports passing an active transaction client (tx) for atomic approval locking.
 *
 * Internally delegates to getPayrollExposureBatch() with a single-element array
 * so that both call paths share one canonical implementation.
 *
 * Public API contract (unchanged since Slice 8):
 *   Input:  budgetLineId: string, tx?: Prisma.TransactionClient
 *   Output: Promise<BudgetLinePayrollExposureResult>
 */
export async function getBudgetLinePayrollExposure(
  budgetLineId: string,
  tx?: Prisma.TransactionClient,
): Promise<BudgetLinePayrollExposureResult> {
  const zero = new Prisma.Decimal('0.00');

  const batch = await getPayrollExposureBatch([budgetLineId], tx);

  return (
    batch.get(budgetLineId) ?? {
      budgetLineId,
      approvedPayroll: zero,
      pendingPayroll: zero,
    }
  );
}

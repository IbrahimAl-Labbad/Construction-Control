/**
 * lib/payroll/queries/get-payroll-exposure-batch.ts
 *
 * Batch-capable payroll aggregation core (Vertical Slice 9 — Executive Dashboard).
 *
 * Aggregates approved and pending payroll totals for one or more BudgetLines
 * in exactly TWO database queries (one groupBy per status) regardless of how
 * many budget lines are requested.
 *
 * SEMANTICS: Identical to getBudgetLinePayrollExposure() — same status filters,
 * same deletedAt=null exclusion, same Prisma.Decimal arithmetic.
 *
 * Used by:
 *   - getBudgetLinePayrollExposure()  → delegates here with a single-element array
 *   - getDashboardSummary()           → passes all allBudgetLineIds at once (no N+1)
 *
 * Status inclusion matrix:
 *   APPROVED   → approvedPayroll
 *   SUBMITTED  → pendingPayroll
 *   DRAFT      → excluded
 *   REJECTED   → excluded
 *   CANCELLED  → excluded
 *   deletedAt IS NOT NULL → excluded
 *
 * No N+1. No second payroll formula. One canonical implementation.
 *
 * Adheres to AGENTS.md §13 (exact Decimal arithmetic) and §14 (no hard deletes).
 */

import { prisma } from '@/lib/db/prisma';
import { PayrollStatus, Prisma } from '@prisma/client';

import type { BudgetLinePayrollExposureResult } from './get-budget-line-payroll-exposure';

/**
 * Aggregates approved and pending payroll totals for multiple BudgetLines
 * in exactly two grouped DB queries.
 *
 * @param budgetLineIds - Array of BudgetLine IDs to aggregate for.
 *                        Returns an empty Map immediately when empty.
 * @param tx           - Optional Prisma transaction client (for use within transactions).
 * @returns            Map<budgetLineId, BudgetLinePayrollExposureResult>
 *                     Every requested ID is present in the result map.
 *                     Lines with no payroll entries receive { approvedPayroll: 0, pendingPayroll: 0 }.
 */
export async function getPayrollExposureBatch(
  budgetLineIds: string[],
  tx?: Prisma.TransactionClient,
): Promise<Map<string, BudgetLinePayrollExposureResult>> {
  if (budgetLineIds.length === 0) {
    return new Map();
  }

  const client = tx ?? prisma;
  const zero = new Prisma.Decimal('0.00');

  // Two grouped queries — one per status bucket — covering all requested lines
  const [approvedAgg, pendingAgg] = await Promise.all([
    client.payrollEntry.groupBy({
      by: ['budgetLineId'],
      where: {
        budgetLineId: { in: budgetLineIds },
        status: PayrollStatus.APPROVED,
        deletedAt: null,
      },
      _sum: { amount: true },
    }),
    client.payrollEntry.groupBy({
      by: ['budgetLineId'],
      where: {
        budgetLineId: { in: budgetLineIds },
        status: PayrollStatus.SUBMITTED,
        deletedAt: null,
      },
      _sum: { amount: true },
    }),
  ]);

  // Index results by budgetLineId for O(1) lookup
  const approvedByLine = new Map(
    approvedAgg.map((r) => [r.budgetLineId, r._sum.amount ?? zero]),
  );
  const pendingByLine = new Map(
    pendingAgg.map((r) => [r.budgetLineId, r._sum.amount ?? zero]),
  );

  // Build result map — every requested ID is guaranteed to be present
  const result = new Map<string, BudgetLinePayrollExposureResult>();
  for (const id of budgetLineIds) {
    result.set(id, {
      budgetLineId: id,
      approvedPayroll: approvedByLine.get(id) ?? zero,
      pendingPayroll: pendingByLine.get(id) ?? zero,
    });
  }

  return result;
}

/**
 * lib/budget/calculations.ts
 *
 * Authoritative financial calculations for the Project Budget domain.
 * Uses exact Prisma.Decimal arithmetic — strictly adheres to AGENTS.md §13 (no IEEE 754 float math).
 *
 * SERVER-ONLY: imports Prisma.Decimal which is a server runtime dependency.
 * Do not import from 'use client' components.
 *
 * Canonical Exposure Formula (AGENTS.md §13 & Vertical Slices 3, 6, 8, 9):
 *   TotalActiveExposure = ApprovedCommitments
 *                         + DirectActualSpend (APPROVED expenses without custodyId)
 *                         + CustodyActualSpend (APPROVED expenses with custodyId)
 *                         + OutstandingCustodies (ISSUED/PARTIALLY_SETTLED: amount - settled - returned)
 *                         + ApprovedPayroll
 *
 *   AvailableBalance = AuthorizedAmount - TotalActiveExposure
 *
 *   TotalPendingExposure = PendingCommitments (SUBMITTED)
 *                          + PendingDirectExpenses (SUBMITTED)
 *                          + PendingCustodies (SUBMITTED)
 *                          + PendingPayroll (SUBMITTED)
 *
 *   ProjectedBalance = AvailableBalance - TotalPendingExposure
 *
 * Architectural Invariant:
 *   - SubcontractorBilling amounts certify work against an approved Commitment.
 *   - They encumber the Commitment ceiling ONLY and MUST NEVER enter calculateBudgetLineExposure().
 *   - ApprovedPayroll is included under BudgetCategory.LABOR.
 */

import { Prisma } from '@prisma/client';

export type BudgetLineActiveExposureResult = {
  authorizedAmount: Prisma.Decimal;
  approvedExpenses: Prisma.Decimal;
  approvedCommitments: Prisma.Decimal;
  approvedPayroll: Prisma.Decimal;
  outstandingCustodies: Prisma.Decimal;
  totalActiveExposure: Prisma.Decimal;
  availableBalance: Prisma.Decimal;
  pendingCustodies: Prisma.Decimal;
  pendingPayroll: Prisma.Decimal;
  totalPendingExposure: Prisma.Decimal;
  projectedBalance: Prisma.Decimal;
};

export type CalculateBudgetLineExposureParams = {
  authorizedAmount: Prisma.Decimal;
  approvedCommitments: Prisma.Decimal;
  directActualSpend: Prisma.Decimal;
  custodyActualSpend: Prisma.Decimal;
  outstandingCustodies: Prisma.Decimal;
  approvedPayroll?: Prisma.Decimal;
  pendingCommitments?: Prisma.Decimal;
  pendingDirectExpenses?: Prisma.Decimal;
  pendingCustodies?: Prisma.Decimal;
  pendingPayroll?: Prisma.Decimal;
};

/**
 * Calculates budget line active and projected exposure metrics ensuring zero double counting.
 *
 * Pure domain function with no side effects and no database dependencies.
 */
export function calculateBudgetLineExposure(
  params: CalculateBudgetLineExposureParams,
): BudgetLineActiveExposureResult {
  const zero = new Prisma.Decimal('0.00');
  const authorizedAmount = params.authorizedAmount;
  const approvedCommitments = params.approvedCommitments;
  const directActualSpend = params.directActualSpend;
  const custodyActualSpend = params.custodyActualSpend;
  const outstandingCustodies = params.outstandingCustodies;
  const approvedPayroll = params.approvedPayroll ?? zero;
  const pendingPayroll = params.pendingPayroll ?? zero;

  // Total approved expenses = direct spend + custody settled spend
  const approvedExpenses = directActualSpend.add(custodyActualSpend);

  // Total Active Exposure = Commitments + Direct Spend + Custody Spend + Outstanding Custodies + Approved Payroll
  const totalActiveExposure = approvedCommitments
    .add(directActualSpend)
    .add(custodyActualSpend)
    .add(outstandingCustodies)
    .add(approvedPayroll);

  const availableBalance = authorizedAmount.sub(totalActiveExposure);

  const pendingCommitments = params.pendingCommitments ?? zero;
  const pendingDirectExpenses = params.pendingDirectExpenses ?? zero;
  const pendingCustodies = params.pendingCustodies ?? zero;

  const totalPendingExposure = pendingCommitments
    .add(pendingDirectExpenses)
    .add(pendingCustodies)
    .add(pendingPayroll);

  const projectedBalance = availableBalance.sub(totalPendingExposure);

  return {
    authorizedAmount,
    approvedExpenses,
    approvedCommitments,
    approvedPayroll,
    outstandingCustodies,
    totalActiveExposure,
    availableBalance,
    pendingCustodies,
    pendingPayroll,
    totalPendingExposure,
    projectedBalance,
  };
}

/**
 * Returns true if adding additionalAmount to currentExposure would breach authorizedCeiling.
 */
export function isBudgetLineOverCeiling(
  currentExposure: Prisma.Decimal,
  additionalAmount: Prisma.Decimal,
  authorizedCeiling: Prisma.Decimal,
): boolean {
  return currentExposure.add(additionalAmount).greaterThan(authorizedCeiling);
}

/**
 * Calculates remaining available headroom under a budget line ceiling before exceeding it.
 * Can be negative if currently over budget.
 */
export function calculateRemainingBudgetLineBalance(
  authorizedCeiling: Prisma.Decimal,
  currentExposure: Prisma.Decimal,
): Prisma.Decimal {
  return authorizedCeiling.sub(currentExposure);
}

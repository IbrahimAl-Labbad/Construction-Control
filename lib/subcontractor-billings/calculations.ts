/**
 * lib/subcontractor-billings/calculations.ts
 *
 * Pure financial calculations for the Subcontractor Billing module.
 * Uses exact Prisma.Decimal arithmetic — never IEEE 754 floating-point.
 *
 * SERVER-ONLY: imports Prisma.Decimal which is a server runtime dependency.
 * Do not import from 'use client' components.
 *
 * Financial invariant (AGENTS.md §13 + Vertical Slice 7 design gate):
 *   - Approved billing amounts are checked against Commitment.amount ONLY.
 *   - Approved billings MUST NOT be added to BudgetLine totalActiveExposure.
 *   - calculateBudgetLineExposure() in lib/custodies/calculations.ts is
 *     NOT modified by Slice 7. BudgetLine exposure formula remains:
 *     ApprovedCommitments + ApprovedExpenses + OutstandingCustodies.
 *
 * Strictly adheres to AGENTS.md §13 (no JS Number calculations for money).
 */

import { Prisma, SubcontractorBillingStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BillingCumulativeResult = {
  /** Sum of all approved billing grossAmounts for a given Commitment. */
  cumulativeCertified: Prisma.Decimal;
  /** Commitment.amount minus cumulativeCertified. */
  remainingCommitmentBalance: Prisma.Decimal;
};

export type BillingCeilingCheckResult = {
  /** Sum of APPROVED billings before the current one. */
  previousCumulativeCertified: Prisma.Decimal;
  /** The current billing grossAmount being evaluated. */
  currentGrossAmount: Prisma.Decimal;
  /** previousCumulativeCertified + currentGrossAmount. */
  newCumulativeCertified: Prisma.Decimal;
  /** Commitment.amount minus newCumulativeCertified after approval. */
  remainingCommitmentBalance: Prisma.Decimal;
  /** True if the ceiling is not breached. */
  withinCeiling: boolean;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculates the remaining balance on an approved Commitment after deducting
 * the cumulative certified billing amount.
 *
 * @param commitmentAmount - Total authorized amount of the commitment.
 * @param cumulativeCertified - Sum of approved billing amounts.
 * @returns Remaining commitment balance as Prisma.Decimal.
 */
export function calculateRemainingCommitmentBalance(
  commitmentAmount: Prisma.Decimal,
  cumulativeCertified: Prisma.Decimal,
): Prisma.Decimal {
  return commitmentAmount.sub(cumulativeCertified);
}

/**
 * Calculates the cumulative certified amount for a Commitment by summing
 * all approved billing grossAmounts.
 *
 * If records include a `status` field, only APPROVED billings are included.
 * Otherwise, assumes all passed records are approved billings.
 *
 * @param commitmentAmount - Total authorized amount of the commitment.
 * @param approvedBillings - Array of billing records with grossAmount (and optional status).
 * @returns Cumulative certified amount and remaining commitment balance.
 */
export function calculateCumulativeCertified(
  commitmentAmount: Prisma.Decimal,
  approvedBillings: ReadonlyArray<{
    grossAmount: Prisma.Decimal;
    status?: SubcontractorBillingStatus | string;
  }>,
): BillingCumulativeResult {
  const zero = new Prisma.Decimal('0.00');

  const eligibleBillings = approvedBillings.filter(
    (b) =>
      !('status' in b) ||
      b.status === undefined ||
      b.status === SubcontractorBillingStatus.APPROVED,
  );

  const cumulativeCertified = eligibleBillings.reduce(
    (acc, billing) => acc.add(billing.grossAmount),
    zero,
  );

  const remainingCommitmentBalance = calculateRemainingCommitmentBalance(
    commitmentAmount,
    cumulativeCertified,
  );

  return {
    cumulativeCertified,
    remainingCommitmentBalance,
  };
}

/**
 * Validates whether approving the current billing would breach the
 * Commitment ceiling. Must be called inside the locked transaction
 * after aggregating existing APPROVED billings.
 *
 * Lock order (enforced by approve-billing use-case):
 *   budget_lines → commitments → subcontractor_billings
 *
 * @param commitmentAmount - The APPROVED Commitment's total authorized amount.
 * @param previousCumulativeCertified - Sum of APPROVED billings BEFORE this one.
 * @param currentGrossAmount - The grossAmount of the billing being approved.
 * @returns Ceiling check result including withinCeiling flag and audit metadata.
 */
export function checkBillingCeiling(
  commitmentAmount: Prisma.Decimal,
  previousCumulativeCertified: Prisma.Decimal,
  currentGrossAmount: Prisma.Decimal,
): BillingCeilingCheckResult {
  const newCumulativeCertified = previousCumulativeCertified.add(currentGrossAmount);
  const remainingCommitmentBalance = calculateRemainingCommitmentBalance(
    commitmentAmount,
    newCumulativeCertified,
  );
  const withinCeiling = newCumulativeCertified.lessThanOrEqualTo(commitmentAmount);

  return {
    previousCumulativeCertified,
    currentGrossAmount,
    newCumulativeCertified,
    remainingCommitmentBalance,
    withinCeiling,
  };
}

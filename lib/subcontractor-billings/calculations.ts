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

import { Prisma } from '@prisma/client';

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
 * Calculates the cumulative certified amount for a Commitment by summing
 * all approved billing grossAmounts.
 *
 * Must be called with records already filtered to:
 *   - status === APPROVED
 *   - deletedAt === null
 *   - commitmentId === <target commitment>
 *
 * @param approvedBillings - Array of approved billing records with grossAmount.
 * @returns Cumulative certified amount and remaining commitment balance.
 */
export function calculateCumulativeCertified(
  commitmentAmount: Prisma.Decimal,
  approvedBillings: ReadonlyArray<{ grossAmount: Prisma.Decimal }>,
): BillingCumulativeResult {
  const zero = new Prisma.Decimal('0.00');

  const cumulativeCertified = approvedBillings.reduce(
    (acc, billing) => acc.add(billing.grossAmount),
    zero,
  );

  const remainingCommitmentBalance = commitmentAmount.sub(cumulativeCertified);

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
  const remainingCommitmentBalance = commitmentAmount.sub(newCumulativeCertified);
  const withinCeiling = newCumulativeCertified.lessThanOrEqualTo(commitmentAmount);

  return {
    previousCumulativeCertified,
    currentGrossAmount,
    newCumulativeCertified,
    remainingCommitmentBalance,
    withinCeiling,
  };
}

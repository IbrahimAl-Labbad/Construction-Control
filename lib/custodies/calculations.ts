/**
 * lib/custodies/calculations.ts
 *
 * Pure financial calculations for the Custody module using exact Prisma.Decimal arithmetic.
 * Strictly adheres to AGENTS.md §13 (no JS Number calculations).
 */

import { Prisma } from '@prisma/client';

export type CustodyCalculatedBalances = {
  settledExpenses: Prisma.Decimal;
  cashReturned: Prisma.Decimal;
  remainingBalance: Prisma.Decimal;
  availableToClaim: Prisma.Decimal;
};

/**
 * Calculates real-time financial balances for a single custody envelope.
 */
export function calculateCustodyBalances(params: {
  amount: Prisma.Decimal;
  settledExpenses?: Prisma.Decimal | null;
  cashReturned?: Prisma.Decimal | null;
  pendingExpenses?: Prisma.Decimal | null;
}): CustodyCalculatedBalances {
  const zero = new Prisma.Decimal('0.00');
  const amount = params.amount;
  const settledExpenses = params.settledExpenses ?? zero;
  const cashReturned = params.cashReturned ?? zero;
  const pendingExpenses = params.pendingExpenses ?? zero;

  const remainingBalance = amount.sub(settledExpenses).sub(cashReturned);
  const availableToClaim = remainingBalance.sub(pendingExpenses);

  return {
    settledExpenses,
    cashReturned,
    remainingBalance,
    availableToClaim,
  };
}

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

/**
 * Calculates budget line active and projected exposure metrics ensuring zero double counting.
 *
 * Canonical Exposure Formula (AGENTS.md §13 & Vertical Slice 8):
 *   TotalActiveExposure = ApprovedCommitments
 *                         + DirectActualSpend
 *                         + CustodyActualSpend
 *                         + OutstandingCustodies
 *                         + ApprovedPayroll
 *
 *   AvailableBalance = AuthorizedAmount - TotalActiveExposure
 *
 *   TotalPendingExposure = PendingCommitments
 *                          + PendingDirectExpenses
 *                          + PendingCustodies
 *                          + PendingPayroll
 *
 *   ProjectedBalance = AvailableBalance - TotalPendingExposure
 *
 * Backward compatibility: approvedPayroll and pendingPayroll default to 0.00 if omitted.
 */
export function calculateBudgetLineExposure(params: {
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
}): BudgetLineActiveExposureResult {
  const zero = new Prisma.Decimal('0.00');
  const authorizedAmount = params.authorizedAmount;
  const approvedCommitments = params.approvedCommitments;
  const directActualSpend = params.directActualSpend;
  const custodyActualSpend = params.custodyActualSpend;
  const outstandingCustodies = params.outstandingCustodies;
  const approvedPayroll = params.approvedPayroll ?? zero;
  const pendingPayroll = params.pendingPayroll ?? zero;

  // Total approved expenses = direct + custody settled expenses
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


/**
 * lib/custodies/calculations.ts
 *
 * Pure financial calculations for the Custody module using exact Prisma.Decimal arithmetic.
 * Strictly adheres to AGENTS.md §13 (no JS Number calculations).
 */

import { CustodyStatus, ExpenseStatus, Prisma } from '@prisma/client';

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

export type UserCustodiesTotals = {
  totalIssued: string;
  totalSettled: string;
  totalReturned: string;
  totalOutstanding: string;
};

/**
 * Calculates project or user-level custody totals using exact Prisma.Decimal arithmetic.
 * Eliminates client-side float math in custody views.
 */
export function calculateUserCustodiesTotals(
  custodies: Array<{
    status: CustodyStatus;
    amount: string;
    settledExpensesAmount: string;
    cashReturnedAmount: string;
    remainingBalance: string;
  }>,
): UserCustodiesTotals {
  let totalIssued = new Prisma.Decimal('0.00');
  let totalSettled = new Prisma.Decimal('0.00');
  let totalReturned = new Prisma.Decimal('0.00');
  let totalOutstanding = new Prisma.Decimal('0.00');

  for (const c of custodies) {
    if (
      c.status !== CustodyStatus.DRAFT &&
      c.status !== CustodyStatus.SUBMITTED &&
      c.status !== CustodyStatus.CANCELLED &&
      c.status !== CustodyStatus.REJECTED
    ) {
      totalIssued = totalIssued.add(new Prisma.Decimal(c.amount));
    }

    totalSettled = totalSettled.add(new Prisma.Decimal(c.settledExpensesAmount));
    totalReturned = totalReturned.add(new Prisma.Decimal(c.cashReturnedAmount));

    if (c.status === CustodyStatus.ISSUED || c.status === CustodyStatus.PARTIALLY_SETTLED) {
      totalOutstanding = totalOutstanding.add(new Prisma.Decimal(c.remainingBalance));
    }
  }

  return {
    totalIssued: totalIssued.toFixed(2),
    totalSettled: totalSettled.toFixed(2),
    totalReturned: totalReturned.toFixed(2),
    totalOutstanding: totalOutstanding.toFixed(2),
  };
}

export interface CustodyForOutstandingCalculation {
  status?: CustodyStatus;
  amount: Prisma.Decimal;
  cashReturnedAmount: Prisma.Decimal;
  expenses: Array<{
    amount: Prisma.Decimal;
    status?: ExpenseStatus;
  }>;
}

/**
 * Calculates the total outstanding advance balance held in the field across a list of custodies.
 * Outstanding = amount - settledExpenses (APPROVED) - cashReturnedAmount.
 * Only applies to active custodies (ISSUED and PARTIALLY_SETTLED). If status is omitted,
 * assumes the custody has already been pre-filtered to active envelopes.
 */
export function sumOutstandingCustodyBalances(
  custodies: CustodyForOutstandingCalculation[],
): Prisma.Decimal {
  let totalOutstanding = new Prisma.Decimal('0.00');

  for (const c of custodies) {
    if (
      c.status !== undefined &&
      c.status !== CustodyStatus.ISSUED &&
      c.status !== CustodyStatus.PARTIALLY_SETTLED
    ) {
      continue;
    }

    const settled = c.expenses
      .filter((e) => e.status === undefined || e.status === ExpenseStatus.APPROVED)
      .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

    const remaining = c.amount.sub(settled).sub(c.cashReturnedAmount);
    totalOutstanding = totalOutstanding.add(remaining);
  }

  return totalOutstanding;
}

// ---------------------------------------------------------------------------
// Re-export canonical BudgetLine exposure calculation from the Budget domain.
// Preserves 100% backward compatibility with Slices 6, 8, 9, and 13 callers.
// ---------------------------------------------------------------------------
export {
  calculateBudgetLineExposure,
  type BudgetLineActiveExposureResult,
  type CalculateBudgetLineExposureParams,
} from '@/lib/budget/calculations';



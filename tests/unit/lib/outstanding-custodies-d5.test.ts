/**
 * tests/unit/lib/outstanding-custodies-d5.test.ts
 *
 * Unit tests for Phase D5:
 * - sumOutstandingCustodyBalances pure domain function
 * - isBudgetLineOverCeiling pure domain function
 * - calculateRemainingBudgetLineBalance pure domain function
 */

import { describe, expect, it } from 'vitest';
import { CustodyStatus, ExpenseStatus, Prisma } from '@prisma/client';
import { isBudgetLineOverCeiling, calculateRemainingBudgetLineBalance } from '@/lib/budget';
import { sumOutstandingCustodyBalances } from '@/lib/custodies';

describe('Phase D5: Outstanding Custodies and Ceiling Logic', () => {
  describe('sumOutstandingCustodyBalances', () => {
    it('returns zero for empty array', () => {
      const result = sumOutstandingCustodyBalances([]);
      expect(result.equals(new Prisma.Decimal('0.00'))).toBe(true);
    });

    it('accurately sums remaining balance of active custodies (amount - settled - returned)', () => {
      const custodies = [
        {
          status: CustodyStatus.ISSUED,
          amount: new Prisma.Decimal('10000.00'),
          cashReturnedAmount: new Prisma.Decimal('0.00'),
          expenses: [
            { amount: new Prisma.Decimal('2500.00'), status: ExpenseStatus.APPROVED },
            { amount: new Prisma.Decimal('1500.00'), status: ExpenseStatus.APPROVED },
          ],
        },
        {
          status: CustodyStatus.PARTIALLY_SETTLED,
          amount: new Prisma.Decimal('5000.00'),
          cashReturnedAmount: new Prisma.Decimal('1000.00'),
          expenses: [
            { amount: new Prisma.Decimal('2000.00'), status: ExpenseStatus.APPROVED },
          ],
        },
      ];

      // Envelope 1: 10000 - 4000 - 0 = 6000
      // Envelope 2: 5000 - 2000 - 1000 = 2000
      // Total = 8000
      const total = sumOutstandingCustodyBalances(custodies);
      expect(total.toFixed(2)).toBe('8000.00');
    });

    it('ignores non-active custodies (DRAFT, SUBMITTED, REJECTED, CANCELLED)', () => {
      const custodies = [
        {
          status: CustodyStatus.DRAFT,
          amount: new Prisma.Decimal('5000.00'),
          cashReturnedAmount: new Prisma.Decimal('0.00'),
          expenses: [],
        },
        {
          status: CustodyStatus.SUBMITTED,
          amount: new Prisma.Decimal('5000.00'),
          cashReturnedAmount: new Prisma.Decimal('0.00'),
          expenses: [],
        },
        {
          status: CustodyStatus.REJECTED,
          amount: new Prisma.Decimal('5000.00'),
          cashReturnedAmount: new Prisma.Decimal('0.00'),
          expenses: [],
        },
        {
          status: CustodyStatus.CANCELLED,
          amount: new Prisma.Decimal('5000.00'),
          cashReturnedAmount: new Prisma.Decimal('0.00'),
          expenses: [],
        },
        {
          status: CustodyStatus.ISSUED,
          amount: new Prisma.Decimal('3000.00'),
          cashReturnedAmount: new Prisma.Decimal('500.00'),
          expenses: [],
        },
      ];

      // Only the ISSUED one counts: 3000 - 500 = 2500
      const total = sumOutstandingCustodyBalances(custodies);
      expect(total.toFixed(2)).toBe('2500.00');
    });

    it('filters out non-approved expenses when calculating settled amount', () => {
      const custodies = [
        {
          status: CustodyStatus.ISSUED,
          amount: new Prisma.Decimal('10000.00'),
          cashReturnedAmount: new Prisma.Decimal('0.00'),
          expenses: [
            { amount: new Prisma.Decimal('2000.00'), status: ExpenseStatus.APPROVED },
            { amount: new Prisma.Decimal('3000.00'), status: ExpenseStatus.SUBMITTED },
            { amount: new Prisma.Decimal('1000.00'), status: ExpenseStatus.REJECTED },
          ],
        },
      ];

      // Only approved 2000 is settled: 10000 - 2000 = 8000
      const total = sumOutstandingCustodyBalances(custodies);
      expect(total.toFixed(2)).toBe('8000.00');
    });
  });

  describe('isBudgetLineOverCeiling and calculateRemainingBudgetLineBalance', () => {
    it('isBudgetLineOverCeiling returns true only when strictly greater than ceiling', () => {
      const ceiling = new Prisma.Decimal('10000.00');
      const current = new Prisma.Decimal('7000.00');

      // 7000 + 2000 = 9000 <= 10000 -> false
      expect(isBudgetLineOverCeiling(current, new Prisma.Decimal('2000.00'), ceiling)).toBe(false);

      // 7000 + 3000 = 10000 <= 10000 -> false (boundary condition)
      expect(isBudgetLineOverCeiling(current, new Prisma.Decimal('3000.00'), ceiling)).toBe(false);

      // 7000 + 3000.01 = 10000.01 > 10000 -> true
      expect(isBudgetLineOverCeiling(current, new Prisma.Decimal('3000.01'), ceiling)).toBe(true);
    });

    it('calculateRemainingBudgetLineBalance returns exact headroom', () => {
      const ceiling = new Prisma.Decimal('10000.00');
      const current = new Prisma.Decimal('7500.25');

      const remaining = calculateRemainingBudgetLineBalance(ceiling, current);
      expect(remaining.toFixed(2)).toBe('2499.75');
    });
  });
});

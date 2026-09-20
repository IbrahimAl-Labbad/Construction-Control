/**
 * tests/unit/lib/custody-calculations.test.ts
 *
 * Unit tests for Custody financial arithmetic and BudgetLine exposure calculations.
 * Adheres strictly to AGENTS.md §13 (exact Decimal arithmetic, no JS floating-point).
 */

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  calculateCustodyBalances,
  calculateBudgetLineExposure,
} from '@/lib/custodies/calculations';

describe('Custody Financial Calculations', () => {
  describe('calculateCustodyBalances', () => {
    it('handles initial state with no expenses or returns', () => {
      const result = calculateCustodyBalances({
        amount: new Prisma.Decimal('10000.00'),
      });

      expect(result.settledExpenses.toFixed(2)).toBe('0.00');
      expect(result.cashReturned.toFixed(2)).toBe('0.00');
      expect(result.remainingBalance.toFixed(2)).toBe('10000.00');
      expect(result.availableToClaim.toFixed(2)).toBe('10000.00');
    });

    it('calculates remaining balance with settled expenses and cash return', () => {
      const result = calculateCustodyBalances({
        amount: new Prisma.Decimal('10000.00'),
        settledExpenses: new Prisma.Decimal('6500.25'),
        cashReturned: new Prisma.Decimal('1500.00'),
        pendingExpenses: new Prisma.Decimal('1000.00'),
      });

      // 10,000 - 6,500.25 - 1,500.00 = 1,999.75
      expect(result.remainingBalance.toFixed(2)).toBe('1999.75');
      // availableToClaim = 1,999.75 - 1,000.00 = 999.75
      expect(result.availableToClaim.toFixed(2)).toBe('999.75');
    });

    it('handles fully settled custody envelope with zero remaining', () => {
      const result = calculateCustodyBalances({
        amount: new Prisma.Decimal('5000.00'),
        settledExpenses: new Prisma.Decimal('3800.00'),
        cashReturned: new Prisma.Decimal('1200.00'),
      });

      expect(result.remainingBalance.toFixed(2)).toBe('0.00');
      expect(result.availableToClaim.toFixed(2)).toBe('0.00');
    });

    it('preserves exact decimal cents without floating point drift', () => {
      const result = calculateCustodyBalances({
        amount: new Prisma.Decimal('1000.00'),
        settledExpenses: new Prisma.Decimal('333.33'),
        cashReturned: new Prisma.Decimal('166.67'),
      });

      // 1000.00 - 333.33 - 166.67 = 500.00 exactly
      expect(result.remainingBalance.toFixed(2)).toBe('500.00');
    });
  });

  describe('calculateBudgetLineExposure', () => {
    it('proves zero double-counting formula across direct, commitments, and custodies', () => {
      // Invariant: TotalActiveExposure = Commitments + DirectSpend + CustodySpend + OutstandingCustodies
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('50000.00'),
        approvedCommitments: new Prisma.Decimal('15000.00'),
        directActualSpend: new Prisma.Decimal('10000.00'),
        custodyActualSpend: new Prisma.Decimal('5000.00'),
        outstandingCustodies: new Prisma.Decimal('8000.00'), // Remaining unspent advance
        pendingCommitments: new Prisma.Decimal('2000.00'),
        pendingDirectExpenses: new Prisma.Decimal('1000.00'),
        pendingCustodies: new Prisma.Decimal('3000.00'),
      });

      // Total approved expenses = direct (10k) + custody spend (5k) = 15,000.00
      expect(result.approvedExpenses.toFixed(2)).toBe('15000.00');

      // Total active exposure = 15,000 (commitments) + 10,000 (direct) + 5,000 (custody spend) + 8,000 (outstanding) = 38,000.00
      expect(result.totalActiveExposure.toFixed(2)).toBe('38000.00');

      // Available balance = 50,000 - 38,000 = 12,000.00
      expect(result.availableBalance.toFixed(2)).toBe('12000.00');

      // Total pending exposure = 2,000 + 1,000 + 3,000 = 6,000.00
      expect(result.totalPendingExposure.toFixed(2)).toBe('6000.00');

      // Projected balance = 12,000 - 6,000 = 6,000.00
      expect(result.projectedBalance.toFixed(2)).toBe('6000.00');
    });

    it('handles line with zero spend and zero commitments', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('25000.00'),
        approvedCommitments: new Prisma.Decimal('0.00'),
        directActualSpend: new Prisma.Decimal('0.00'),
        custodyActualSpend: new Prisma.Decimal('0.00'),
        outstandingCustodies: new Prisma.Decimal('0.00'),
      });

      expect(result.totalActiveExposure.toFixed(2)).toBe('0.00');
      expect(result.availableBalance.toFixed(2)).toBe('25000.00');
      expect(result.totalPendingExposure.toFixed(2)).toBe('0.00');
      expect(result.projectedBalance.toFixed(2)).toBe('25000.00');
    });
  });
});

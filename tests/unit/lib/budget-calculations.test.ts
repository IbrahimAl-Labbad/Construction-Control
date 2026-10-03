/**
 * tests/unit/lib/budget-calculations.test.ts
 *
 * Unit tests for the canonical Project Budget calculations module (lib/budget/calculations.ts).
 * Validates exact Prisma.Decimal arithmetic and canonical exposure formulas per AGENTS.md §13.
 */

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  calculateBudgetLineExposure,
  isBudgetLineOverCeiling,
  calculateRemainingBudgetLineBalance,
} from '@/lib/budget/calculations';
import { calculateBudgetLineExposure as exportFromIndex } from '@/lib/budget';

describe('lib/budget/calculations', () => {
  describe('barrel export consistency', () => {
    it('exports calculateBudgetLineExposure from lib/budget index identically', () => {
      expect(exportFromIndex).toBe(calculateBudgetLineExposure);
    });
  });

  describe('calculateBudgetLineExposure', () => {
    it('proves zero double-counting formula across direct, commitments, and custodies', () => {
      // Invariant: TotalActiveExposure = Commitments + DirectSpend + CustodySpend + OutstandingCustodies + ApprovedPayroll
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

    it('integrates approved and pending payroll into exposure calculation', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('100000.00'),
        approvedCommitments: new Prisma.Decimal('20000.00'),
        directActualSpend: new Prisma.Decimal('15000.00'),
        custodyActualSpend: new Prisma.Decimal('5000.00'),
        outstandingCustodies: new Prisma.Decimal('10000.00'),
        approvedPayroll: new Prisma.Decimal('25000.00'),
        pendingCommitments: new Prisma.Decimal('5000.00'),
        pendingDirectExpenses: new Prisma.Decimal('2000.00'),
        pendingCustodies: new Prisma.Decimal('3000.00'),
        pendingPayroll: new Prisma.Decimal('4000.00'),
      });

      // Total Active Exposure = 20k + 15k + 5k + 10k + 25k = 75,000.00
      expect(result.totalActiveExposure.toFixed(2)).toBe('75000.00');
      expect(result.availableBalance.toFixed(2)).toBe('25000.00');

      // Total Pending Exposure = 5k + 2k + 3k + 4k = 14,000.00
      expect(result.totalPendingExposure.toFixed(2)).toBe('14000.00');
      expect(result.projectedBalance.toFixed(2)).toBe('11000.00');
    });

    it('preserves exact Decimal arithmetic without floating-point precision loss', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000.00'),
        approvedCommitments: new Prisma.Decimal('333.33'),
        directActualSpend: new Prisma.Decimal('166.67'),
        custodyActualSpend: new Prisma.Decimal('100.00'),
        outstandingCustodies: new Prisma.Decimal('150.00'),
      });

      // 333.33 + 166.67 + 100.00 + 150.00 = 750.00
      expect(result.totalActiveExposure.toFixed(2)).toBe('750.00');
      // 1000.00 - 750.00 = 250.00
      expect(result.availableBalance.toFixed(2)).toBe('250.00');
    });
  });

  describe('isBudgetLineOverCeiling', () => {
    it('returns false when current + additional is strictly less than ceiling', () => {
      const current = new Prisma.Decimal('400.00');
      const additional = new Prisma.Decimal('50.00');
      const ceiling = new Prisma.Decimal('500.00');
      expect(isBudgetLineOverCeiling(current, additional, ceiling)).toBe(false);
    });

    it('returns false when current + additional exactly equals ceiling', () => {
      const current = new Prisma.Decimal('400.00');
      const additional = new Prisma.Decimal('100.00');
      const ceiling = new Prisma.Decimal('500.00');
      expect(isBudgetLineOverCeiling(current, additional, ceiling)).toBe(false);
    });

    it('returns true when current + additional exceeds ceiling', () => {
      const current = new Prisma.Decimal('400.00');
      const additional = new Prisma.Decimal('100.01');
      const ceiling = new Prisma.Decimal('500.00');
      expect(isBudgetLineOverCeiling(current, additional, ceiling)).toBe(true);
    });
  });

  describe('calculateRemainingBudgetLineBalance', () => {
    it('computes positive remaining balance correctly', () => {
      const ceiling = new Prisma.Decimal('10000.00');
      const exposure = new Prisma.Decimal('6500.00');
      expect(calculateRemainingBudgetLineBalance(ceiling, exposure).toFixed(2)).toBe('3500.00');
    });

    it('computes zero remaining balance when exactly at ceiling', () => {
      const ceiling = new Prisma.Decimal('10000.00');
      const exposure = new Prisma.Decimal('10000.00');
      expect(calculateRemainingBudgetLineBalance(ceiling, exposure).toFixed(2)).toBe('0.00');
    });

    it('computes negative remaining balance when over ceiling', () => {
      const ceiling = new Prisma.Decimal('10000.00');
      const exposure = new Prisma.Decimal('12000.00');
      expect(calculateRemainingBudgetLineBalance(ceiling, exposure).toFixed(2)).toBe('-2000.00');
    });
  });
});

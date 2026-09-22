/**
 * tests/unit/lib/subcontractor-billing-calculations.test.ts
 *
 * Unit tests for Subcontractor Billing financial arithmetic and ceiling checks.
 * Uses Prisma.Decimal exclusively — strictly avoids IEEE 754 floating-point drift.
 * Follows AGENTS.md §13 (Financial Security & Exact Decimal Arithmetic).
 */

import { describe, expect, it } from 'vitest';
import { Prisma, SubcontractorBillingStatus } from '@prisma/client';
import {
  calculateCumulativeCertified,
  calculateRemainingCommitmentBalance,
  checkBillingCeiling,
} from '@/lib/subcontractor-billings/calculations';

describe('Subcontractor Billing Financial Calculations', () => {
  describe('calculateCumulativeCertified', () => {
    it('Case 1: handles zero billings -> cumulative 0.00 and full commitment remaining', () => {
      const commitmentAmount = new Prisma.Decimal('50000.00');
      const result = calculateCumulativeCertified(commitmentAmount, []);

      expect(result.cumulativeCertified.isZero()).toBe(true);
      expect(result.cumulativeCertified.toFixed(2)).toBe('0.00');
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('50000.00');
      expect(result.cumulativeCertified).toBeInstanceOf(Prisma.Decimal);
      expect(result.remainingCommitmentBalance).toBeInstanceOf(Prisma.Decimal);
    });

    it('Case 2: handles one APPROVED billing correctly', () => {
      const commitmentAmount = new Prisma.Decimal('100000.00');
      const billings = [
        {
          grossAmount: new Prisma.Decimal('25430.75'),
          status: SubcontractorBillingStatus.APPROVED,
        },
      ];

      const result = calculateCumulativeCertified(commitmentAmount, billings);

      expect(result.cumulativeCertified.toFixed(2)).toBe('25430.75');
      // 100,000.00 - 25,430.75 = 74,569.25
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('74569.25');
    });

    it('Case 3: handles multiple APPROVED billings correctly', () => {
      const commitmentAmount = new Prisma.Decimal('150000.00');
      const billings = [
        { grossAmount: new Prisma.Decimal('20000.25') },
        { grossAmount: new Prisma.Decimal('45000.50') },
        { grossAmount: new Prisma.Decimal('34999.25') },
      ];

      const result = calculateCumulativeCertified(commitmentAmount, billings);

      // 20000.25 + 45000.50 + 34999.25 = 100000.00
      expect(result.cumulativeCertified.toFixed(2)).toBe('100000.00');
      // 150000.00 - 100000.00 = 50000.00
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('50000.00');
    });

    it('Case 4: mixed statuses -> only APPROVED billings are included in cumulative sum', () => {
      const commitmentAmount = new Prisma.Decimal('80000.00');
      const billings = [
        {
          grossAmount: new Prisma.Decimal('10000.00'),
          status: SubcontractorBillingStatus.APPROVED,
        },
        {
          grossAmount: new Prisma.Decimal('5000.00'),
          status: SubcontractorBillingStatus.DRAFT,
        },
        {
          grossAmount: new Prisma.Decimal('7000.00'),
          status: SubcontractorBillingStatus.SUBMITTED,
        },
        {
          grossAmount: new Prisma.Decimal('12000.00'),
          status: SubcontractorBillingStatus.REJECTED,
        },
        {
          grossAmount: new Prisma.Decimal('4000.00'),
          status: SubcontractorBillingStatus.CANCELLED,
        },
        {
          grossAmount: new Prisma.Decimal('15000.50'),
          status: SubcontractorBillingStatus.APPROVED,
        },
      ];

      const result = calculateCumulativeCertified(commitmentAmount, billings);

      // Only APPROVED: 10000.00 + 15000.50 = 25000.50
      expect(result.cumulativeCertified.toFixed(2)).toBe('25000.50');
      // 80000.00 - 25000.50 = 54999.50
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('54999.50');
    });

    it('Case 5: exact decimal arithmetic preserves cents without floating-point error', () => {
      const commitmentAmount = new Prisma.Decimal('1.00');
      const billings = [
        { grossAmount: new Prisma.Decimal('0.10') },
        { grossAmount: new Prisma.Decimal('0.20') },
      ];

      const result = calculateCumulativeCertified(commitmentAmount, billings);

      // In IEEE 754 float: 0.10 + 0.20 = 0.30000000000000004
      // With Prisma.Decimal: exactly 0.30
      expect(result.cumulativeCertified.toFixed(2)).toBe('0.30');
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('0.70');

      // 3-way split: 333.33 + 333.33 + 333.34 = 1000.00 exactly
      const splitBillings = [
        { grossAmount: new Prisma.Decimal('333.33') },
        { grossAmount: new Prisma.Decimal('333.33') },
        { grossAmount: new Prisma.Decimal('333.34') },
      ];
      const splitResult = calculateCumulativeCertified(
        new Prisma.Decimal('1000.00'),
        splitBillings,
      );
      expect(splitResult.cumulativeCertified.toFixed(2)).toBe('1000.00');
      expect(splitResult.remainingCommitmentBalance.toFixed(2)).toBe('0.00');
    });

    it('Case 6: handles large monetary values without floating-point precision loss', () => {
      const commitmentAmount = new Prisma.Decimal('999999999999.99');
      const billings = [
        { grossAmount: new Prisma.Decimal('123456789012.34') },
        { grossAmount: new Prisma.Decimal('876543210987.65') },
      ];

      const result = calculateCumulativeCertified(commitmentAmount, billings);

      // 123456789012.34 + 876543210987.65 = 999999999999.99
      expect(result.cumulativeCertified.toFixed(2)).toBe('999999999999.99');
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('0.00');
    });
  });

  describe('calculateRemainingCommitmentBalance', () => {
    it('Case 1: partial certification calculates exact remaining commitment balance', () => {
      const commitment = new Prisma.Decimal('60000.00');
      const cumulative = new Prisma.Decimal('18500.25');

      const balance = calculateRemainingCommitmentBalance(commitment, cumulative);

      expect(balance).toBeInstanceOf(Prisma.Decimal);
      expect(balance.toFixed(2)).toBe('41499.75');
    });

    it('Case 2: full certification results in exactly 0.00', () => {
      const commitment = new Prisma.Decimal('75000.00');
      const cumulative = new Prisma.Decimal('75000.00');

      const balance = calculateRemainingCommitmentBalance(commitment, cumulative);

      expect(balance.isZero()).toBe(true);
      expect(balance.toFixed(2)).toBe('0.00');
    });

    it('Case 3: exact decimal remainder with non-trivial cent fractions', () => {
      const commitment = new Prisma.Decimal('10000.00');
      const cumulative = new Prisma.Decimal('3333.33');

      const balance = calculateRemainingCommitmentBalance(commitment, cumulative);

      expect(balance.toFixed(2)).toBe('6666.67');
      expect(balance.toFixed(4)).toBe('6666.6700');
    });

    it('handles negative remainder when cumulative exceeds commitment (over-certified)', () => {
      const commitment = new Prisma.Decimal('10000.00');
      const cumulative = new Prisma.Decimal('10500.50');

      const balance = calculateRemainingCommitmentBalance(commitment, cumulative);

      expect(balance.isNegative()).toBe(true);
      expect(balance.toFixed(2)).toBe('-500.50');
    });
  });

  describe('checkBillingCeiling', () => {
    it('Case 1: billing within ceiling succeeds and asserts full audit metadata', () => {
      const commitmentAmount = new Prisma.Decimal('50000.00');
      const previousCumulative = new Prisma.Decimal('20000.00');
      const currentGross = new Prisma.Decimal('15000.00');

      const result = checkBillingCeiling(commitmentAmount, previousCumulative, currentGross);

      expect(result.withinCeiling).toBe(true);
      expect(result.previousCumulativeCertified.toFixed(2)).toBe('20000.00');
      expect(result.currentGrossAmount.toFixed(2)).toBe('15000.00');
      expect(result.newCumulativeCertified.toFixed(2)).toBe('35000.00');
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('15000.00');
    });

    it('Case 2: billing hitting exact ceiling succeeds with 0.00 remaining balance', () => {
      const commitmentAmount = new Prisma.Decimal('60000.00');
      const previousCumulative = new Prisma.Decimal('42000.00');
      const currentGross = new Prisma.Decimal('18000.00');

      const result = checkBillingCeiling(commitmentAmount, previousCumulative, currentGross);

      expect(result.withinCeiling).toBe(true);
      expect(result.previousCumulativeCertified.toFixed(2)).toBe('42000.00');
      expect(result.currentGrossAmount.toFixed(2)).toBe('18000.00');
      expect(result.newCumulativeCertified.toFixed(2)).toBe('60000.00');
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('0.00');
    });

    it('Case 3: billing exceeding ceiling by even 0.01 fails with withinCeiling: false', () => {
      const commitmentAmount = new Prisma.Decimal('60000.00');
      const previousCumulative = new Prisma.Decimal('42000.00');
      const currentGross = new Prisma.Decimal('18000.01'); // 1 cent over!

      const result = checkBillingCeiling(commitmentAmount, previousCumulative, currentGross);

      expect(result.withinCeiling).toBe(false);
      expect(result.previousCumulativeCertified.toFixed(2)).toBe('42000.00');
      expect(result.currentGrossAmount.toFixed(2)).toBe('18000.01');
      expect(result.newCumulativeCertified.toFixed(2)).toBe('60000.01');
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('-0.01');
    });

    it('Case 4: first billing with zero previous cumulative is evaluated correctly', () => {
      const commitmentAmount = new Prisma.Decimal('100000.00');
      const previousCumulative = new Prisma.Decimal('0.00');
      const currentGross = new Prisma.Decimal('40000.50');

      const result = checkBillingCeiling(commitmentAmount, previousCumulative, currentGross);

      expect(result.withinCeiling).toBe(true);
      expect(result.previousCumulativeCertified.toFixed(2)).toBe('0.00');
      expect(result.currentGrossAmount.toFixed(2)).toBe('40000.50');
      expect(result.newCumulativeCertified.toFixed(2)).toBe('40000.50');
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('59999.50');
    });

    it('Case 5: large Decimal values evaluated accurately without overflow', () => {
      const commitmentAmount = new Prisma.Decimal('500000000.00');
      const previousCumulative = new Prisma.Decimal('200000000.00');
      const currentGross = new Prisma.Decimal('150000000.00');

      const result = checkBillingCeiling(commitmentAmount, previousCumulative, currentGross);

      expect(result.withinCeiling).toBe(true);
      expect(result.previousCumulativeCertified.toFixed(2)).toBe('200000000.00');
      expect(result.currentGrossAmount.toFixed(2)).toBe('150000000.00');
      expect(result.newCumulativeCertified.toFixed(2)).toBe('350000000.00');
      expect(result.remainingCommitmentBalance.toFixed(2)).toBe('150000000.00');
    });

    it('asserts all audit metadata fields are Prisma.Decimal and structurally complete', () => {
      const result = checkBillingCeiling(
        new Prisma.Decimal('1000.00'),
        new Prisma.Decimal('200.00'),
        new Prisma.Decimal('300.00'),
      );

      expect(result.previousCumulativeCertified).toBeInstanceOf(Prisma.Decimal);
      expect(result.currentGrossAmount).toBeInstanceOf(Prisma.Decimal);
      expect(result.newCumulativeCertified).toBeInstanceOf(Prisma.Decimal);
      expect(result.remainingCommitmentBalance).toBeInstanceOf(Prisma.Decimal);
      expect(typeof result.withinCeiling).toBe('boolean');
    });
  });
});

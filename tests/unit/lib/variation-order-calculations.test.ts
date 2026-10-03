/**
 * tests/unit/lib/variation-order-calculations.test.ts
 *
 * Unit tests for exact Decimal financial calculations in Variation Orders (Slice 20).
 * Tests line deltas, total order impact, revised budgets, commitment ceilings,
 * precision rounding, and project variation aggregates.
 *
 * Follows AGENTS.md §5, §13, §17, §20.
 */

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  calculateLineFinancialDelta,
  calculateVariationOrderTotalImpact,
  calculateRevisedBudget,
  calculateRevisedBudgetLineCeiling,
  calculateEffectiveCommitmentCeiling,
  calculateProjectVariationsSummary,
} from '@/lib/variation-orders/calculations';

describe('Variation Order Financial Calculations', () => {
  describe('calculateLineFinancialDelta', () => {
    it('calculates positive delta when quantity increases at same rate', () => {
      // 100 units @ 50 SAR -> 150 units @ 50 SAR => +50 units => +2,500.00 SAR
      const result = calculateLineFinancialDelta({
        originalQuantity: '100',
        revisedQuantity: '150',
        originalRate: '50.00',
        revisedRate: '50.00',
      });

      expect(result.quantityDelta.toString()).toBe('50');
      expect(result.originalTotal.toString()).toBe('5000');
      expect(result.revisedTotal.toString()).toBe('7500');
      expect(result.financialDelta.toString()).toBe('2500');
      expect(result.financialDeltaFormatted).toBe('2500.00');
    });

    it('calculates negative delta (omission/reduction) when quantity decreases', () => {
      // 100 units @ 50 SAR -> 70 units @ 50 SAR => -30 units => -1,500.00 SAR
      const result = calculateLineFinancialDelta({
        originalQuantity: '100',
        revisedQuantity: '70',
        originalRate: '50.00',
        revisedRate: '50.00',
      });

      expect(result.quantityDelta.toString()).toBe('-30');
      expect(result.originalTotal.toString()).toBe('5000');
      expect(result.revisedTotal.toString()).toBe('3500');
      expect(result.financialDelta.toString()).toBe('-1500');
      expect(result.financialDeltaFormatted).toBe('-1500.00');
    });

    it('calculates delta when rate changes for unchanged quantity', () => {
      // 100 units @ 50 SAR -> 100 units @ 65 SAR => +1,500.00 SAR
      const result = calculateLineFinancialDelta({
        originalQuantity: '100',
        revisedQuantity: '100',
        originalRate: '50.00',
        revisedRate: '65.00',
      });

      expect(result.quantityDelta.toString()).toBe('0');
      expect(result.financialDelta.toString()).toBe('1500');
      expect(result.financialDeltaFormatted).toBe('1500.00');
    });

    it('calculates delta when both quantity and rate change simultaneously', () => {
      // Original: 100 @ 50 = 5,000.00
      // Revised:  120 @ 55 = 6,600.00
      // Delta:    6,600.00 - 5,000.00 = +1,600.00
      const result = calculateLineFinancialDelta({
        originalQuantity: '100',
        revisedQuantity: '120',
        originalRate: '50.00',
        revisedRate: '55.00',
      });

      expect(result.financialDelta.toString()).toBe('1600');
      expect(result.financialDeltaFormatted).toBe('1600.00');
    });

    it('handles brand new scope item (original qty and rate = 0)', () => {
      // 0 @ 0 -> 25 @ 400 = +10,000.00
      const result = calculateLineFinancialDelta({
        originalQuantity: '0',
        revisedQuantity: '25',
        originalRate: '0.00',
        revisedRate: '400.00',
      });

      expect(result.quantityDelta.toString()).toBe('25');
      expect(result.financialDelta.toString()).toBe('10000');
      expect(result.financialDeltaFormatted).toBe('10000.00');
    });

    it('handles complete item cancellation (revised qty = 0)', () => {
      // 50 @ 100 = 5,000 -> 0 @ 0 = 0 => -5,000.00
      const result = calculateLineFinancialDelta({
        originalQuantity: '50',
        revisedQuantity: '0',
        originalRate: '100.00',
        revisedRate: '0.00',
      });

      expect(result.quantityDelta.toString()).toBe('-50');
      expect(result.financialDelta.toString()).toBe('-5000');
      expect(result.financialDeltaFormatted).toBe('-5000.00');
    });

    it('preserves exact fractional precision without float distortion', () => {
      // 3.3333 units @ 10.33 SAR = 34.432989 -> rounded to 2 decimal places = 34.43
      // original: 0 @ 0
      const result = calculateLineFinancialDelta({
        originalQuantity: '0',
        revisedQuantity: '3.3333',
        originalRate: '0.00',
        revisedRate: '10.33',
      });

      expect(result.financialDeltaFormatted).toBe('34.43');
    });
  });

  describe('calculateVariationOrderTotalImpact', () => {
    it('sums mixed positive and negative line deltas correctly', () => {
      const lineDeltas = [
        new Prisma.Decimal('15000.50'),
        new Prisma.Decimal('-5000.25'),
        new Prisma.Decimal('250.75'),
      ];

      const total = calculateVariationOrderTotalImpact(lineDeltas);
      // 15000.50 - 5000.25 + 250.75 = 10251.00
      expect(total.toFixed(2)).toBe('10251.00');
    });

    it('returns zero for empty lines array', () => {
      const total = calculateVariationOrderTotalImpact([]);
      expect(total.toFixed(2)).toBe('0.00');
    });
  });

  describe('calculateRevisedBudget', () => {
    it('adds approved variation orders to original budget', () => {
      const original = new Prisma.Decimal('1000000.00');
      const approvedVariations = [
        new Prisma.Decimal('75000.00'),
        new Prisma.Decimal('25000.00'),
      ];

      const revised = calculateRevisedBudget(original, approvedVariations);
      expect(revised.toFixed(2)).toBe('1100000.00');
    });

    it('subtracts approved omission variations from original budget', () => {
      const original = new Prisma.Decimal('1000000.00');
      const approvedVariations = [
        new Prisma.Decimal('50000.00'),
        new Prisma.Decimal('-120000.00'),
      ];

      const revised = calculateRevisedBudget(original, approvedVariations);
      expect(revised.toFixed(2)).toBe('930000.00');
    });
  });

  describe('calculateRevisedBudgetLineCeiling', () => {
    it('adjusts specific budget line ceiling with its approved variations', () => {
      const lineOriginal = new Prisma.Decimal('200000.00');
      const lineVariations = [
        new Prisma.Decimal('35000.00'),
        new Prisma.Decimal('-5000.00'),
      ];

      const lineRevised = calculateRevisedBudgetLineCeiling(lineOriginal, lineVariations);
      expect(lineRevised.toFixed(2)).toBe('230000.00');
    });
  });

  describe('calculateEffectiveCommitmentCeiling', () => {
    it('adjusts commitment ceiling when variation order is linked to it', () => {
      const commitmentOriginal = new Prisma.Decimal('150000.00');
      const commitmentVariations = [new Prisma.Decimal('18500.00')];

      const ceiling = calculateEffectiveCommitmentCeiling(commitmentOriginal, commitmentVariations);
      expect(ceiling.toFixed(2)).toBe('168500.00');
    });
  });

  describe('calculateProjectVariationsSummary', () => {
    it('aggregates approved and pending variations separately', () => {
      const originalBudget = new Prisma.Decimal('1000000.00');
      const variations = [
        { status: 'DRAFT', impactAmount: new Prisma.Decimal('10000.00') },
        { status: 'SUBMITTED', impactAmount: new Prisma.Decimal('20000.00') },
        { status: 'SUBMITTED', impactAmount: new Prisma.Decimal('-5000.00') },
        { status: 'APPROVED', impactAmount: new Prisma.Decimal('50000.00') },
        { status: 'APPROVED', impactAmount: new Prisma.Decimal('-10000.00') },
        { status: 'REJECTED', impactAmount: new Prisma.Decimal('99000.00') },
      ];

      const summary = calculateProjectVariationsSummary(originalBudget, variations);

      expect(summary.originalBudget.toFixed(2)).toBe('1000000.00');

      // Approved variations total = +50000 - 10000 = +40000.00
      expect(summary.approvedVariationsTotal.toFixed(2)).toBe('40000.00');

      // Revised Approved Budget = 1,000,000 + 40,000 = 1,040,000.00
      expect(summary.revisedApprovedBudget.toFixed(2)).toBe('1040000.00');

      // Pending variations total = +20000 - 5000 = +15000.00
      expect(summary.pendingVariationsTotal.toFixed(2)).toBe('15000.00');

      // Projected Budget = 1,040,000 + 15,000 = 1,055,000.00
      expect(summary.projectedBudget.toFixed(2)).toBe('1055000.00');

      // Increases and Decreases breakdown
      expect(summary.totalApprovedIncreases.toFixed(2)).toBe('50000.00');
      expect(summary.totalApprovedDecreases.toFixed(2)).toBe('10000.00');

      // Counts
      expect(summary.counts).toEqual({
        draft: 1,
        submitted: 2,
        approved: 2,
        rejected: 1,
        total: 6,
      });
    });

    it('verifies that DRAFT and REJECTED variations never alter approved budget', () => {
      const originalBudget = new Prisma.Decimal('500000.00');
      const variations = [
        { status: 'DRAFT', impactAmount: new Prisma.Decimal('200000.00') },
        { status: 'REJECTED', impactAmount: new Prisma.Decimal('300000.00') },
      ];

      const summary = calculateProjectVariationsSummary(originalBudget, variations);

      expect(summary.approvedVariationsTotal.toFixed(2)).toBe('0.00');
      expect(summary.revisedApprovedBudget.toFixed(2)).toBe('500000.00');
      expect(summary.pendingVariationsTotal.toFixed(2)).toBe('0.00');
    });
  });
});

/**
 * tests/unit/lib/payroll-domain-calculations.test.ts
 *
 * Unit tests for Payroll financial arithmetic, duplicate-key normalization,
 * and domain invariant assertion helpers.
 *
 * Follows AGENTS.md §13 (Financial Security & Exact Decimal Arithmetic).
 * Uses Prisma.Decimal exclusively — strictly avoids IEEE 754 floating-point drift.
 */

import { describe, expect, it } from 'vitest';
import { Prisma, PayrollStatus } from '@prisma/client';
import {
  normalizePayrollWorkerName,
  buildPayrollDuplicateKey,
  calculateApprovedPayrollTotal,
  calculatePendingPayrollTotal,
  calculatePeriodLaborCost,
  calculateProjectLaborCost,
  calculateRemainingLaborBudget,
  calculateProjectLaborSummary,
  assertValidPayrollPeriod,
  assertPositivePayrollAmount,
  assertSARCurrency,
} from '@/lib/payroll/calculations';
import { AppError } from '@/lib/errors';

describe('Payroll Domain Calculations & Business Key', () => {
  describe('BD-10 Business Key & Worker Name Normalization', () => {
    it('trims leading whitespace', () => {
      expect(normalizePayrollWorkerName('   أحمد محمد')).toBe('أحمد محمد');
    });

    it('trims trailing whitespace', () => {
      expect(normalizePayrollWorkerName('أحمد محمد   ')).toBe('أحمد محمد');
    });

    it('collapses repeated internal whitespace into a single space', () => {
      expect(normalizePayrollWorkerName('أحمد     علي    حسن')).toBe('أحمد علي حسن');
    });

    it('handles mixed tabs, newlines, and spaces', () => {
      expect(normalizePayrollWorkerName(" \t  سالم \n   عبدالله  \t ")).toBe('سالم عبدالله');
    });

    it('produces identical duplicate key for differently spaced versions of the same name', () => {
      const key1 = buildPayrollDuplicateKey({
        projectId: 'proj-1',
        periodYear: 2026,
        periodMonth: 9,
        workerName: '  محمد   خالد  ',
      });
      const key2 = buildPayrollDuplicateKey({
        projectId: 'proj-1',
        periodYear: 2026,
        periodMonth: 9,
        workerName: 'محمد خالد',
      });
      expect(key1).toBe('proj-1:2026:9:محمد خالد');
      expect(key1).toBe(key2);
    });

    it('produces different duplicate keys for different worker names', () => {
      const key1 = buildPayrollDuplicateKey({
        projectId: 'proj-1',
        periodYear: 2026,
        periodMonth: 9,
        workerName: 'محمد خالد',
      });
      const key2 = buildPayrollDuplicateKey({
        projectId: 'proj-1',
        periodYear: 2026,
        periodMonth: 9,
        workerName: 'محمود خالد',
      });
      expect(key1).not.toBe(key2);
    });

    it('produces different duplicate keys for same worker across different projects', () => {
      const key1 = buildPayrollDuplicateKey({
        projectId: 'proj-1',
        periodYear: 2026,
        periodMonth: 9,
        workerName: 'محمد خالد',
      });
      const key2 = buildPayrollDuplicateKey({
        projectId: 'proj-2',
        periodYear: 2026,
        periodMonth: 9,
        workerName: 'محمد خالد',
      });
      expect(key1).not.toBe(key2);
    });

    it('produces different duplicate keys for same worker/project across different periods', () => {
      const keyMonth1 = buildPayrollDuplicateKey({
        projectId: 'proj-1',
        periodYear: 2026,
        periodMonth: 8,
        workerName: 'محمد خالد',
      });
      const keyMonth2 = buildPayrollDuplicateKey({
        projectId: 'proj-1',
        periodYear: 2026,
        periodMonth: 9,
        workerName: 'محمد خالد',
      });
      const keyYear2 = buildPayrollDuplicateKey({
        projectId: 'proj-1',
        periodYear: 2027,
        periodMonth: 9,
        workerName: 'محمد خالد',
      });

      expect(keyMonth1).not.toBe(keyMonth2);
      expect(keyMonth2).not.toBe(keyYear2);
    });
  });

  describe('calculateApprovedPayrollTotal & Labor Costs', () => {
    it('handles empty collection -> 0.00', () => {
      const total = calculateApprovedPayrollTotal([]);
      expect(total.isZero()).toBe(true);
      expect(total.toFixed(2)).toBe('0.00');
      expect(total).toBeInstanceOf(Prisma.Decimal);
    });

    it('handles one approved amount', () => {
      const entries = [
        { amount: new Prisma.Decimal('4500.50'), status: PayrollStatus.APPROVED },
      ];
      const total = calculateApprovedPayrollTotal(entries);
      expect(total.toFixed(2)).toBe('4500.50');
    });

    it('handles multiple approved amounts with exact decimal addition', () => {
      const entries = [
        { amount: new Prisma.Decimal('3500.25'), status: PayrollStatus.APPROVED },
        { amount: new Prisma.Decimal('4200.50'), status: PayrollStatus.APPROVED },
        { amount: new Prisma.Decimal('2299.25'), status: PayrollStatus.APPROVED },
      ];
      const total = calculateApprovedPayrollTotal(entries);
      // 3500.25 + 4200.50 + 2299.25 = 10000.00
      expect(total.toFixed(2)).toBe('10000.00');
    });

    it('filters out non-approved statuses (DRAFT, SUBMITTED, REJECTED, CANCELLED)', () => {
      const entries = [
        { amount: new Prisma.Decimal('1000.00'), status: PayrollStatus.APPROVED },
        { amount: new Prisma.Decimal('2000.00'), status: PayrollStatus.DRAFT },
        { amount: new Prisma.Decimal('3000.00'), status: PayrollStatus.SUBMITTED },
        { amount: new Prisma.Decimal('4000.00'), status: PayrollStatus.REJECTED },
        { amount: new Prisma.Decimal('5000.00'), status: PayrollStatus.CANCELLED },
        { amount: new Prisma.Decimal('1500.75'), status: PayrollStatus.APPROVED },
      ];
      const total = calculateApprovedPayrollTotal(entries);
      // Only APPROVED: 1000.00 + 1500.75 = 2500.75
      expect(total.toFixed(2)).toBe('2500.75');
    });

    it('assumes approved when status field is omitted', () => {
      const entries = [
        { amount: new Prisma.Decimal('2500.00') },
        { amount: new Prisma.Decimal('1500.00') },
      ];
      const total = calculateApprovedPayrollTotal(entries);
      expect(total.toFixed(2)).toBe('4000.00');
    });

    it('calculatePeriodLaborCost and calculateProjectLaborCost match approved total', () => {
      const entries = [
        { amount: new Prisma.Decimal('5000.00'), status: PayrollStatus.APPROVED },
        { amount: new Prisma.Decimal('2500.00'), status: PayrollStatus.APPROVED },
      ];
      expect(calculatePeriodLaborCost(entries).toFixed(2)).toBe('7500.00');
      expect(calculateProjectLaborCost(entries).toFixed(2)).toBe('7500.00');
    });

    it('handles very large Decimal values without precision loss', () => {
      const entries = [
        { amount: new Prisma.Decimal('999999999999.99'), status: PayrollStatus.APPROVED },
        { amount: new Prisma.Decimal('0.01'), status: PayrollStatus.APPROVED },
      ];
      const total = calculateApprovedPayrollTotal(entries);
      expect(total.toFixed(2)).toBe('1000000000000.00');
    });
  });

  describe('calculatePendingPayrollTotal', () => {
    it('sums only SUBMITTED entries', () => {
      const entries = [
        { amount: new Prisma.Decimal('1000.00'), status: PayrollStatus.APPROVED },
        { amount: new Prisma.Decimal('2500.00'), status: PayrollStatus.SUBMITTED },
        { amount: new Prisma.Decimal('3500.50'), status: PayrollStatus.SUBMITTED },
        { amount: new Prisma.Decimal('1200.00'), status: PayrollStatus.DRAFT },
      ];
      const pending = calculatePendingPayrollTotal(entries);
      // 2500.00 + 3500.50 = 6000.50
      expect(pending.toFixed(2)).toBe('6000.50');
    });

    it('returns 0.00 when no SUBMITTED entries exist', () => {
      const entries = [
        { amount: new Prisma.Decimal('1000.00'), status: PayrollStatus.APPROVED },
        { amount: new Prisma.Decimal('2000.00'), status: PayrollStatus.DRAFT },
      ];
      const pending = calculatePendingPayrollTotal(entries);
      expect(pending.isZero()).toBe(true);
      expect(pending.toFixed(2)).toBe('0.00');
    });
  });

  describe('calculateRemainingLaborBudget', () => {
    it('calculates remaining budget exactly', () => {
      const budget = new Prisma.Decimal('100000.00');
      const approved = new Prisma.Decimal('35420.75');
      const remaining = calculateRemainingLaborBudget(budget, approved);
      // 100,000.00 - 35,420.75 = 64,579.25
      expect(remaining.toFixed(2)).toBe('64579.25');
    });

    it('returns exactly 0.00 when approved equals budget', () => {
      const budget = new Prisma.Decimal('50000.00');
      const approved = new Prisma.Decimal('50000.00');
      const remaining = calculateRemainingLaborBudget(budget, approved);
      expect(remaining.isZero()).toBe(true);
      expect(remaining.toFixed(2)).toBe('0.00');
    });

    it('returns negative Decimal when approved exceeds budget (NO silent clamping to zero)', () => {
      const budget = new Prisma.Decimal('50000.00');
      const approved = new Prisma.Decimal('55000.50');
      const remaining = calculateRemainingLaborBudget(budget, approved);
      // 50,000.00 - 55,000.50 = -5,000.50
      expect(remaining.isNegative()).toBe(true);
      expect(remaining.toFixed(2)).toBe('-5000.50');
    });
  });

  describe('calculateProjectLaborSummary', () => {
    it('combines budget, approved, pending, and remaining labor spend', () => {
      const budget = new Prisma.Decimal('200000.00');
      const approved = new Prisma.Decimal('80000.00');
      const pending = new Prisma.Decimal('15000.00');

      const summary = calculateProjectLaborSummary(budget, approved, pending);

      expect(summary.totalLaborBudget.toFixed(2)).toBe('200000.00');
      expect(summary.approvedLaborSpend.toFixed(2)).toBe('80000.00');
      expect(summary.pendingLaborSpend.toFixed(2)).toBe('15000.00');
      expect(summary.remainingLaborBudget.toFixed(2)).toBe('120000.00');
    });

    it('defaults pendingLaborSpend to 0.00 if omitted', () => {
      const budget = new Prisma.Decimal('100000.00');
      const approved = new Prisma.Decimal('30000.00');

      const summary = calculateProjectLaborSummary(budget, approved);

      expect(summary.pendingLaborSpend.toFixed(2)).toBe('0.00');
      expect(summary.remainingLaborBudget.toFixed(2)).toBe('70000.00');
    });
  });

  describe('Domain Invariant: assertValidPayrollPeriod', () => {
    it('accepts valid years (2020..2050) and valid months (1..12)', () => {
      expect(() => assertValidPayrollPeriod(2020, 1)).not.toThrow();
      expect(() => assertValidPayrollPeriod(2026, 9)).not.toThrow();
      expect(() => assertValidPayrollPeriod(2050, 12)).not.toThrow();
    });

    it('rejects year < 2020', () => {
      expect(() => assertValidPayrollPeriod(2019, 6)).toThrow(AppError);
      try {
        assertValidPayrollPeriod(2019, 6);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('INVALID_PAYROLL_PERIOD');
      }
    });

    it('rejects year > 2050', () => {
      expect(() => assertValidPayrollPeriod(2051, 6)).toThrow(AppError);
    });

    it('rejects non-integer year', () => {
      expect(() => assertValidPayrollPeriod(2026.5, 6)).toThrow(AppError);
    });

    it('rejects month < 1', () => {
      expect(() => assertValidPayrollPeriod(2026, 0)).toThrow(AppError);
    });

    it('rejects month > 12', () => {
      expect(() => assertValidPayrollPeriod(2026, 13)).toThrow(AppError);
    });

    it('rejects non-integer month', () => {
      expect(() => assertValidPayrollPeriod(2026, 6.5)).toThrow(AppError);
    });
  });

  describe('Domain Invariant: assertPositivePayrollAmount', () => {
    it('accepts positive Decimal amounts', () => {
      expect(() => assertPositivePayrollAmount(new Prisma.Decimal('100.00'))).not.toThrow();
      expect(() => assertPositivePayrollAmount(new Prisma.Decimal('0.01'))).not.toThrow();
    });

    it('accepts valid positive numeric strings and numbers', () => {
      expect(() => assertPositivePayrollAmount('1500.50')).not.toThrow();
      expect(() => assertPositivePayrollAmount(2500)).not.toThrow();
    });

    it('rejects zero amount', () => {
      expect(() => assertPositivePayrollAmount(new Prisma.Decimal('0.00'))).toThrow(AppError);
      try {
        assertPositivePayrollAmount('0');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('INVALID_PAYROLL_AMOUNT');
      }
    });

    it('rejects negative amounts', () => {
      expect(() => assertPositivePayrollAmount(new Prisma.Decimal('-500.00'))).toThrow(AppError);
      expect(() => assertPositivePayrollAmount('-10.50')).toThrow(AppError);
      expect(() => assertPositivePayrollAmount(-1)).toThrow(AppError);
    });

    it('rejects non-numeric strings', () => {
      expect(() => assertPositivePayrollAmount('abc')).toThrow(AppError);
    });
  });

  describe('Domain Invariant: assertSARCurrency', () => {
    it('accepts "SAR"', () => {
      expect(() => assertSARCurrency('SAR')).not.toThrow();
    });

    it('rejects non-SAR currencies with INVALID_PAYROLL_CURRENCY', () => {
      const invalid = ['USD', 'EUR', 'AED', 'sar', ''];
      for (const cur of invalid) {
        expect(() => assertSARCurrency(cur)).toThrow(AppError);
        try {
          assertSARCurrency(cur);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('INVALID_PAYROLL_CURRENCY');
        }
      }
    });
  });
});

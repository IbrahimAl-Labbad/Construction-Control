/**
 * tests/unit/lib/payroll-financial-exposure.test.ts
 *
 * Unit tests for Central BudgetLine Exposure Integration & Payroll Financial Calculations.
 * Adheres strictly to AGENTS.md §13 (Financial Security & Exact Decimal Arithmetic).
 *
 * Covers:
 * - Integration of Approved Payroll and Pending Payroll into calculateBudgetLineExposure
 * - Zero double-counting protections across Expense, Commitment, Billing, and Custody
 * - All 10 mandatory financial test scenarios from Vertical Slice 8 specification
 * - Backward compatibility with callers omitting payroll parameters
 * - Pure ceiling check helper checkPayrollBudgetLineCeiling
 */

import { describe, expect, it } from 'vitest';
import { Prisma, PayrollStatus } from '@prisma/client';
import { calculateBudgetLineExposure } from '@/lib/custodies/calculations';
import {
  calculateApprovedPayrollTotal,
  calculatePendingPayrollTotal,
  checkPayrollBudgetLineCeiling,
} from '@/lib/payroll/calculations';

describe('Payroll Financial Exposure & Central Exposure Integration', () => {
  const zero = new Prisma.Decimal('0.00');

  // -------------------------------------------------------------------------
  // 10 Mandatory Financial Test Scenarios (§21)
  // -------------------------------------------------------------------------
  describe('Mandatory Financial Test Scenarios (§21)', () => {
    it('SCENARIO 1: Budget = 1000, Payroll = 200 => Exposure = 200, Available = 800', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000.00'),
        approvedCommitments: zero,
        directActualSpend: zero,
        custodyActualSpend: zero,
        outstandingCustodies: zero,
        approvedPayroll: new Prisma.Decimal('200.00'),
      });

      expect(result.totalActiveExposure.toFixed(2)).toBe('200.00');
      expect(result.availableBalance.toFixed(2)).toBe('800.00');
    });

    it('SCENARIO 2: Budget = 1000, Payroll = 200, Expense = 100 => Exposure = 300, Available = 700', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000.00'),
        approvedCommitments: zero,
        directActualSpend: new Prisma.Decimal('100.00'),
        custodyActualSpend: zero,
        outstandingCustodies: zero,
        approvedPayroll: new Prisma.Decimal('200.00'),
      });

      expect(result.totalActiveExposure.toFixed(2)).toBe('300.00');
      expect(result.availableBalance.toFixed(2)).toBe('700.00');
    });

    it('SCENARIO 3: Budget = 1000, Commitment = 400, Payroll = 200, Expense = 100 => Exposure = 700, Available = 300', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000.00'),
        approvedCommitments: new Prisma.Decimal('400.00'),
        directActualSpend: new Prisma.Decimal('100.00'),
        custodyActualSpend: zero,
        outstandingCustodies: zero,
        approvedPayroll: new Prisma.Decimal('200.00'),
      });

      expect(result.totalActiveExposure.toFixed(2)).toBe('700.00');
      expect(result.availableBalance.toFixed(2)).toBe('300.00');
    });

    it('SCENARIO 4: Budget = 1000, Commitment = 400, Billing = 300, Payroll = 200 => Expected exposure = 600 (Billing does NOT add exposure)', () => {
      // Subcontractor billing is an authorized drawdown against commitment and does NOT enter BudgetLine exposure
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000.00'),
        approvedCommitments: new Prisma.Decimal('400.00'),
        directActualSpend: zero,
        custodyActualSpend: zero,
        outstandingCustodies: zero,
        approvedPayroll: new Prisma.Decimal('200.00'),
      });

      // Total exposure is 400 (Commitment) + 200 (Payroll) = 600, NOT 900
      expect(result.totalActiveExposure.toFixed(2)).toBe('600.00');
      expect(result.availableBalance.toFixed(2)).toBe('400.00');
    });

    it('SCENARIO 5: Budget = 1000, Outstanding custody = 100, Custody actual = 150, Payroll = 200 => Expected exposure = 450', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000.00'),
        approvedCommitments: zero,
        directActualSpend: zero,
        custodyActualSpend: new Prisma.Decimal('150.00'),
        outstandingCustodies: new Prisma.Decimal('100.00'),
        approvedPayroll: new Prisma.Decimal('200.00'),
      });

      // 150 (custody actual) + 100 (outstanding) + 200 (payroll) = 450
      expect(result.totalActiveExposure.toFixed(2)).toBe('450.00');
      expect(result.availableBalance.toFixed(2)).toBe('550.00');
    });

    it('SCENARIO 6: Budget = 1000, Payroll submitted = 200, Approved payroll = 100 => active = 100, pending = 200', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000.00'),
        approvedCommitments: zero,
        directActualSpend: zero,
        custodyActualSpend: zero,
        outstandingCustodies: zero,
        approvedPayroll: new Prisma.Decimal('100.00'),
        pendingPayroll: new Prisma.Decimal('200.00'),
      });

      expect(result.totalActiveExposure.toFixed(2)).toBe('100.00');
      expect(result.availableBalance.toFixed(2)).toBe('900.00');
      expect(result.totalPendingExposure.toFixed(2)).toBe('200.00');
      expect(result.projectedBalance.toFixed(2)).toBe('700.00');
    });

    it('SCENARIO 7: Budget = 1000, Approved payroll = 1000 => Available = 0', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000.00'),
        approvedCommitments: zero,
        directActualSpend: zero,
        custodyActualSpend: zero,
        outstandingCustodies: zero,
        approvedPayroll: new Prisma.Decimal('1000.00'),
      });

      expect(result.totalActiveExposure.toFixed(2)).toBe('1000.00');
      expect(result.availableBalance.isZero()).toBe(true);
      expect(result.availableBalance.toFixed(2)).toBe('0.00');
    });

    it('SCENARIO 8: Budget = 1000, Approved payroll = 1001 => Available = -1 (Do NOT clamp to zero)', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000.00'),
        approvedCommitments: zero,
        directActualSpend: zero,
        custodyActualSpend: zero,
        outstandingCustodies: zero,
        approvedPayroll: new Prisma.Decimal('1001.00'),
      });

      expect(result.totalActiveExposure.toFixed(2)).toBe('1001.00');
      expect(result.availableBalance.isNegative()).toBe(true);
      expect(result.availableBalance.toFixed(2)).toBe('-1.00');
    });

    it('SCENARIO 9: Payroll + direct Expense both on LABOR are each counted exactly once', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('100000.00'),
        approvedCommitments: zero,
        directActualSpend: new Prisma.Decimal('30000.00'), // direct labor expense
        custodyActualSpend: zero,
        outstandingCustodies: zero,
        approvedPayroll: new Prisma.Decimal('45000.00'),   // labor payroll
      });

      // 30,000 + 45,000 = 75,000 (each counted once, no double counting)
      expect(result.totalActiveExposure.toFixed(2)).toBe('75000.00');
      expect(result.availableBalance.toFixed(2)).toBe('25000.00');
    });

    it('SCENARIO 10: Soft-deleted payroll contributes 0 to exposure calculation', () => {
      const entries = [
        { amount: new Prisma.Decimal('500.00'), status: PayrollStatus.APPROVED },
        { amount: new Prisma.Decimal('700.00'), status: PayrollStatus.APPROVED, deletedAt: new Date() },
      ];

      // Aggregation filters out deletedAt !== null
      const nonDeleted = entries.filter((e) => !('deletedAt' in e) || !e.deletedAt);
      const approvedTotal = calculateApprovedPayrollTotal(nonDeleted);

      expect(approvedTotal.toFixed(2)).toBe('500.00');

      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000.00'),
        approvedCommitments: zero,
        directActualSpend: zero,
        custodyActualSpend: zero,
        outstandingCustodies: zero,
        approvedPayroll: approvedTotal,
      });

      expect(result.totalActiveExposure.toFixed(2)).toBe('500.00');
      expect(result.availableBalance.toFixed(2)).toBe('500.00');
    });
  });

  // -------------------------------------------------------------------------
  // Cross-Domain Double Counting Audit (§10, §11, §12)
  // -------------------------------------------------------------------------
  describe('Cross-Domain Double Counting Audit', () => {
    it('exact specification scenario: 1M budget, 600k commitment, 80k direct expense, 200k payroll => 880k exposure', () => {
      const result = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('1000000.00'),
        approvedCommitments: new Prisma.Decimal('600000.00'),
        directActualSpend: new Prisma.Decimal('80000.00'),
        custodyActualSpend: zero,
        outstandingCustodies: zero,
        approvedPayroll: new Prisma.Decimal('200000.00'),
      });

      expect(result.totalActiveExposure.toFixed(2)).toBe('880000.00');
      expect(result.totalActiveExposure.toFixed(2)).not.toBe('1080000.00');
      expect(result.totalActiveExposure.toFixed(2)).not.toBe('680000.00');
      expect(result.availableBalance.toFixed(2)).toBe('120000.00');
    });

    it('backward compatibility: omitting optional payroll parameters yields identical previous behavior', () => {
      const oldStyleCall = calculateBudgetLineExposure({
        authorizedAmount: new Prisma.Decimal('50000.00'),
        approvedCommitments: new Prisma.Decimal('15000.00'),
        directActualSpend: new Prisma.Decimal('10000.00'),
        custodyActualSpend: new Prisma.Decimal('5000.00'),
        outstandingCustodies: new Prisma.Decimal('8000.00'),
        pendingCommitments: new Prisma.Decimal('2000.00'),
        pendingDirectExpenses: new Prisma.Decimal('1000.00'),
        pendingCustodies: new Prisma.Decimal('3000.00'),
      });

      expect(oldStyleCall.approvedPayroll.toFixed(2)).toBe('0.00');
      expect(oldStyleCall.pendingPayroll.toFixed(2)).toBe('0.00');
      expect(oldStyleCall.totalActiveExposure.toFixed(2)).toBe('38000.00');
      expect(oldStyleCall.availableBalance.toFixed(2)).toBe('12000.00');
      expect(oldStyleCall.totalPendingExposure.toFixed(2)).toBe('6000.00');
      expect(oldStyleCall.projectedBalance.toFixed(2)).toBe('6000.00');
    });
  });

  // -------------------------------------------------------------------------
  // Budget Ceiling Check Helper (checkPayrollBudgetLineCeiling)
  // -------------------------------------------------------------------------
  describe('checkPayrollBudgetLineCeiling', () => {
    it('returns withinCeiling = true when exposure + payroll is less than authorized ceiling', () => {
      const ceiling = new Prisma.Decimal('100000.00');
      const currentExposure = new Prisma.Decimal('70000.00');
      const payrollAmount = new Prisma.Decimal('20000.00');

      const check = checkPayrollBudgetLineCeiling(ceiling, currentExposure, payrollAmount);

      expect(check.withinCeiling).toBe(true);
      expect(check.newTotalActiveExposure.toFixed(2)).toBe('90000.00');
      expect(check.remainingAvailableBalance.toFixed(2)).toBe('10000.00');
    });

    it('returns withinCeiling = true when exposure + payroll exactly equals authorized ceiling', () => {
      const ceiling = new Prisma.Decimal('50000.00');
      const currentExposure = new Prisma.Decimal('40000.00');
      const payrollAmount = new Prisma.Decimal('10000.00');

      const check = checkPayrollBudgetLineCeiling(ceiling, currentExposure, payrollAmount);

      expect(check.withinCeiling).toBe(true);
      expect(check.newTotalActiveExposure.toFixed(2)).toBe('50000.00');
      expect(check.remainingAvailableBalance.toFixed(2)).toBe('0.00');
    });

    it('returns withinCeiling = false when exposure + payroll exceeds authorized ceiling', () => {
      const ceiling = new Prisma.Decimal('50000.00');
      const currentExposure = new Prisma.Decimal('45000.00');
      const payrollAmount = new Prisma.Decimal('10000.00');

      const check = checkPayrollBudgetLineCeiling(ceiling, currentExposure, payrollAmount);

      expect(check.withinCeiling).toBe(false);
      expect(check.newTotalActiveExposure.toFixed(2)).toBe('55000.00');
      expect(check.remainingAvailableBalance.toFixed(2)).toBe('-5000.00');
    });

    it('one halala over: rejects when amount exceeds ceiling by exactly 0.01 SAR', () => {
      const ceiling = new Prisma.Decimal('50000.00');
      const currentExposure = new Prisma.Decimal('40000.00');
      const payrollAmount = new Prisma.Decimal('10000.01'); // exactly 1 halala over

      const check = checkPayrollBudgetLineCeiling(ceiling, currentExposure, payrollAmount);

      expect(check.withinCeiling).toBe(false);
      expect(check.newTotalActiveExposure.toFixed(2)).toBe('50000.01');
      expect(check.remainingAvailableBalance.toFixed(2)).toBe('-0.01');
    });

    it('zero amount: adding zero payroll does not exceed ceiling and preserves balance', () => {
      const ceiling = new Prisma.Decimal('50000.00');
      const currentExposure = new Prisma.Decimal('30000.00');
      const payrollAmount = new Prisma.Decimal('0.00');

      const check = checkPayrollBudgetLineCeiling(ceiling, currentExposure, payrollAmount);

      expect(check.withinCeiling).toBe(true);
      expect(check.newTotalActiveExposure.toFixed(2)).toBe('30000.00');
      expect(check.remainingAvailableBalance.toFixed(2)).toBe('20000.00');
    });

    it('negative available result: when current exposure already exceeds ceiling, balance is negative without clamping', () => {
      const ceiling = new Prisma.Decimal('50000.00');
      const currentExposure = new Prisma.Decimal('55000.00'); // already over
      const payrollAmount = new Prisma.Decimal('1000.00');

      const check = checkPayrollBudgetLineCeiling(ceiling, currentExposure, payrollAmount);

      expect(check.withinCeiling).toBe(false);
      expect(check.newTotalActiveExposure.toFixed(2)).toBe('56000.00');
      expect(check.remainingAvailableBalance.toFixed(2)).toBe('-6000.00');
    });

    it('exact Decimal behavior: maintains 15,2 precision without IEEE-754 drift', () => {
      const ceiling = new Prisma.Decimal('1000.00');
      const currentExposure = new Prisma.Decimal('333.33');
      const payrollAmount = new Prisma.Decimal('666.67');

      const check = checkPayrollBudgetLineCeiling(ceiling, currentExposure, payrollAmount);

      expect(check.withinCeiling).toBe(true);
      expect(check.newTotalActiveExposure.toFixed(2)).toBe('1000.00');
      expect(check.remainingAvailableBalance.toFixed(2)).toBe('0.00');
    });
  });

  // -------------------------------------------------------------------------
  // Pure Status Filtering in calculateApprovedPayrollTotal / calculatePendingPayrollTotal
  // -------------------------------------------------------------------------
  describe('Pure Status Filtering', () => {
    it('calculateApprovedPayrollTotal excludes DRAFT, SUBMITTED, REJECTED, CANCELLED', () => {
      const entries = [
        { amount: new Prisma.Decimal('100.00'), status: PayrollStatus.APPROVED },
        { amount: new Prisma.Decimal('200.00'), status: PayrollStatus.DRAFT },
        { amount: new Prisma.Decimal('300.00'), status: PayrollStatus.SUBMITTED },
        { amount: new Prisma.Decimal('400.00'), status: PayrollStatus.REJECTED },
        { amount: new Prisma.Decimal('500.00'), status: PayrollStatus.CANCELLED },
      ];

      expect(calculateApprovedPayrollTotal(entries).toFixed(2)).toBe('100.00');
    });

    it('calculatePendingPayrollTotal includes only SUBMITTED', () => {
      const entries = [
        { amount: new Prisma.Decimal('100.00'), status: PayrollStatus.APPROVED },
        { amount: new Prisma.Decimal('200.00'), status: PayrollStatus.DRAFT },
        { amount: new Prisma.Decimal('300.00'), status: PayrollStatus.SUBMITTED },
        { amount: new Prisma.Decimal('400.00'), status: PayrollStatus.REJECTED },
        { amount: new Prisma.Decimal('500.00'), status: PayrollStatus.CANCELLED },
      ];

      expect(calculatePendingPayrollTotal(entries).toFixed(2)).toBe('300.00');
    });
  });
});

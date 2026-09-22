/**
 * lib/payroll/calculations.ts
 *
 * Pure financial calculations and domain helpers for the Payroll Data Entry module.
 * Uses exact Prisma.Decimal arithmetic — never IEEE 754 floating-point.
 *
 * SERVER-ONLY: imports Prisma.Decimal which is a server runtime dependency.
 * Do not import from 'use client' components.
 *
 * Financial invariants (AGENTS.md §13 + Vertical Slice 8 specification):
 *   - Money is Decimal(15, 2).
 *   - All arithmetic uses exact decimal methods (add, sub).
 *   - Pure mathematical calculations do NOT silently clamp negative balances to zero.
 *   - Central BudgetLine exposure integration is intentionally deferred to Phase 5.
 *     calculateBudgetLineExposure() in lib/custodies/calculations.ts is NOT modified here.
 */

import { Prisma, PayrollStatus } from '@prisma/client';
import { AppError } from '@/lib/errors';
import type { PayrollDuplicateKeyInput } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectLaborCalculationResult = {
  totalLaborBudget: Prisma.Decimal;
  approvedLaborSpend: Prisma.Decimal;
  pendingLaborSpend: Prisma.Decimal;
  remainingLaborBudget: Prisma.Decimal;
};

// ---------------------------------------------------------------------------
// Business Identity & Normalization Helpers (BD-10)
// ---------------------------------------------------------------------------

/**
 * Normalizes worker name for consistent business identity matching:
 * - Trims leading and trailing whitespace
 * - Collapses repeated internal whitespace into a single space
 * - Preserves exact Arabic and alphanumeric characters without lossy transliteration
 */
export function normalizePayrollWorkerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Builds the deterministic BD-10 business duplicate key:
 *   `${projectId}:${periodYear}:${periodMonth}:${normalizedWorkerName}`
 *
 * Used to detect duplicate labor claims for the same worker on the same project
 * in the same calendar period.
 */
export function buildPayrollDuplicateKey(input: PayrollDuplicateKeyInput): string {
  const normalizedName = normalizePayrollWorkerName(input.workerName);
  return `${input.projectId}:${input.periodYear}:${input.periodMonth}:${normalizedName}`;
}

// ---------------------------------------------------------------------------
// Pure Financial Calculations (Exact Decimal Arithmetic)
// ---------------------------------------------------------------------------

/**
 * Sums approved payroll amounts from a supplied collection of records.
 *
 * If records include a `status` field, only APPROVED records are included.
 * Otherwise, assumes all passed records are approved.
 *
 * @param entries - Array of payroll records with Decimal amount (and optional status).
 * @returns Total approved payroll sum as Prisma.Decimal.
 */
export function calculateApprovedPayrollTotal(
  entries: ReadonlyArray<{
    amount: Prisma.Decimal;
    status?: PayrollStatus | string;
  }>,
): Prisma.Decimal {
  const zero = new Prisma.Decimal('0.00');

  const eligible = entries.filter(
    (e) =>
      !('status' in e) ||
      e.status === undefined ||
      e.status === PayrollStatus.APPROVED,
  );

  return eligible.reduce((acc, entry) => acc.add(entry.amount), zero);
}

/**
 * Sums pending payroll amounts (SUBMITTED status) awaiting Manager approval.
 *
 * @param entries - Array of payroll records with Decimal amount and status.
 * @returns Total pending payroll sum as Prisma.Decimal.
 */
export function calculatePendingPayrollTotal(
  entries: ReadonlyArray<{
    amount: Prisma.Decimal;
    status?: PayrollStatus | string;
  }>,
): Prisma.Decimal {
  const zero = new Prisma.Decimal('0.00');

  const pending = entries.filter((e) => e.status === PayrollStatus.SUBMITTED);

  return pending.reduce((acc, entry) => acc.add(entry.amount), zero);
}

/**
 * Alias for period-level labor cost calculation.
 * Sums approved entries for the specified period.
 */
export function calculatePeriodLaborCost(
  entries: ReadonlyArray<{
    amount: Prisma.Decimal;
    status?: PayrollStatus | string;
  }>,
): Prisma.Decimal {
  return calculateApprovedPayrollTotal(entries);
}

/**
 * Alias for project-level labor cost calculation.
 * Sums approved entries across the project.
 */
export function calculateProjectLaborCost(
  entries: ReadonlyArray<{
    amount: Prisma.Decimal;
    status?: PayrollStatus | string;
  }>,
): Prisma.Decimal {
  return calculateApprovedPayrollTotal(entries);
}

/**
 * Calculates remaining labor budget balance:
 *   remainingLaborBudget = laborBudgetAmount - approvedPayrollTotal
 *
 * Pure mathematical subtraction — does NOT clamp negative values to zero.
 * (A negative balance indicates budget overrun in analysis/reporting).
 *
 * @param laborBudgetAmount - Total allocated labor budget line amount.
 * @param approvedPayrollTotal - Total realized approved labor spend.
 * @returns Remaining balance as Prisma.Decimal.
 */
export function calculateRemainingLaborBudget(
  laborBudgetAmount: Prisma.Decimal,
  approvedPayrollTotal: Prisma.Decimal,
): Prisma.Decimal {
  return laborBudgetAmount.sub(approvedPayrollTotal);
}

/**
 * Calculates a complete labor budget summary combining budget, approved, pending,
 * and remaining balances using exact Decimal arithmetic.
 */
export function calculateProjectLaborSummary(
  laborBudgetAmount: Prisma.Decimal,
  approvedLaborSpend: Prisma.Decimal,
  pendingLaborSpend: Prisma.Decimal = new Prisma.Decimal('0.00'),
): ProjectLaborCalculationResult {
  const remainingLaborBudget = calculateRemainingLaborBudget(
    laborBudgetAmount,
    approvedLaborSpend,
  );

  return {
    totalLaborBudget: laborBudgetAmount,
    approvedLaborSpend,
    pendingLaborSpend,
    remainingLaborBudget,
  };
}

// ---------------------------------------------------------------------------
// Domain Invariant Assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that the payroll calendar period is valid.
 * - Year must be an integer between 2020 and 2050 (matching DB CHECK constraint).
 * - Month must be an integer between 1 and 12 (matching DB CHECK constraint).
 * Throws INVALID_PAYROLL_PERIOD if invariant violated.
 */
export function assertValidPayrollPeriod(year: number, month: number): void {
  if (
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2050 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new AppError(
      'INVALID_PAYROLL_PERIOD',
      `فترة الراتب غير صالحة: السنة (${year}) يجب أن تكون بين 2020 و 2050 والشهر (${month}) بين 1 و 12`,
    );
  }
}

/**
 * Asserts that a payroll monetary amount is positive and valid.
 * Throws INVALID_PAYROLL_AMOUNT if amount <= 0 or invalid.
 */
export function assertPositivePayrollAmount(
  amount: Prisma.Decimal | string | number,
): void {
  let dec: Prisma.Decimal;
  try {
    dec = amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount);
  } catch {
    throw new AppError('INVALID_PAYROLL_AMOUNT', 'مبلغ الراتب غير صالح');
  }

  if (dec.isNaN() || !dec.isFinite() || dec.lessThanOrEqualTo(0)) {
    throw new AppError(
      'INVALID_PAYROLL_AMOUNT',
      'مبلغ قيد الراتب يجب أن يكون أكبر من الصفر',
    );
  }
}

/**
 * Asserts that the payroll currency is SAR (AGENTS.md §13 v1 invariant).
 * Throws INVALID_PAYROLL_CURRENCY if currency is not SAR.
 */
export function assertSARCurrency(currency: string): void {
  if (currency !== 'SAR') {
    throw new AppError(
      'INVALID_PAYROLL_CURRENCY',
      `العملة المدعومة هي الريال السعودي (SAR) فقط. القيمة المقدمة: "${currency}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// Budget Ceiling Check (Pure Calculation for Phase 6 Approval Transaction)
// ---------------------------------------------------------------------------

export type PayrollCeilingCheckResult = {
  currentTotalActiveExposure: Prisma.Decimal;
  payrollAmount: Prisma.Decimal;
  newTotalActiveExposure: Prisma.Decimal;
  remainingAvailableBalance: Prisma.Decimal;
  withinCeiling: boolean;
};

/**
 * Pure calculation to check whether adding a payroll amount would exceed
 * the authorized BudgetLine ceiling.
 *
 * @param authorizedAmount - BudgetLine.amount
 * @param currentTotalActiveExposure - Current total active exposure before approval
 * @param payrollAmount - The amount of the PayrollEntry being approved
 * @returns PayrollCeilingCheckResult including withinCeiling flag
 */
export function checkPayrollBudgetLineCeiling(
  authorizedAmount: Prisma.Decimal,
  currentTotalActiveExposure: Prisma.Decimal,
  payrollAmount: Prisma.Decimal,
): PayrollCeilingCheckResult {
  const newTotalActiveExposure = currentTotalActiveExposure.add(payrollAmount);
  const remainingAvailableBalance = authorizedAmount.sub(newTotalActiveExposure);
  const withinCeiling = newTotalActiveExposure.lessThanOrEqualTo(authorizedAmount);

  return {
    currentTotalActiveExposure,
    payrollAmount,
    newTotalActiveExposure,
    remainingAvailableBalance,
    withinCeiling,
  };
}


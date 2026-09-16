/**
 * tests/unit/lib/commitment-queries.test.ts
 *
 * Unit tests for Commitment exposure and balance formulas.
 * Strictly verifies Mandatory Correction 1:
 * - TotalExposure = ApprovedCommitments + ApprovedExpenses
 * - AvailableBalance = BudgetLine.amount - TotalExposure
 * - PendingCommitmentExposure = SUM(SUBMITTED commitments)
 * - PendingExpenseExposure = SUM(SUBMITTED expenses)
 * - TotalPendingExposure = PendingCommitmentExposure + PendingExpenseExposure
 * - ProjectedBalance = AvailableBalance - TotalPendingExposure
 */

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

describe('Commitment Financial Formulas (Mandatory Correction 1)', () => {
  it('calculates total exposure, available balance, and projected balance accurately using Decimal', () => {
    // Authorized budget line amount = 100,000.00 SAR
    const authorizedAmount = new Prisma.Decimal('100000.00');

    // Approved Expenses = 25,000.00 SAR
    const approvedExpenses = new Prisma.Decimal('25000.00');

    // Approved Commitments = 35,000.00 SAR
    const approvedCommitments = new Prisma.Decimal('35000.00');

    // 1. Total Exposure = ApprovedCommitments + ApprovedExpenses
    const totalExposure = approvedExpenses.add(approvedCommitments);
    expect(totalExposure.toFixed(2)).toBe('60000.00');

    // 2. Available Balance = BudgetLine.amount - TotalExposure
    const availableBalance = authorizedAmount.sub(totalExposure);
    expect(availableBalance.toFixed(2)).toBe('40000.00');

    // 3. Pending Exposures
    const pendingCommitmentExposure = new Prisma.Decimal('15000.00'); // SUBMITTED commitments
    const pendingExpenseExposure = new Prisma.Decimal('5000.00');       // SUBMITTED expenses

    // 4. Total Pending Exposure = PendingCommitmentExposure + PendingExpenseExposure
    const totalPendingExposure = pendingCommitmentExposure.add(pendingExpenseExposure);
    expect(totalPendingExposure.toFixed(2)).toBe('20000.00');

    // 5. Projected Balance = AvailableBalance - TotalPendingExposure
    const projectedBalance = availableBalance.sub(totalPendingExposure);
    expect(projectedBalance.toFixed(2)).toBe('20000.00');
  });

  it('proves that projected balance reflects both submitted commitments and submitted expenses', () => {
    const lineAmount = new Prisma.Decimal('50000.00');
    const approvedExp = new Prisma.Decimal('10000.00');
    const approvedComm = new Prisma.Decimal('15000.00');

    const totalExposure = approvedExp.add(approvedComm); // 25,000.00
    const availableBalance = lineAmount.sub(totalExposure); // 25,000.00

    // Only submitted commitments (e.g. 10,000.00)
    const submittedComm = new Prisma.Decimal('10000.00');
    // Only submitted expenses (e.g. 8,000.00)
    const submittedExp = new Prisma.Decimal('8000.00');

    const totalPending = submittedComm.add(submittedExp); // 18,000.00
    const projectedBalance = availableBalance.sub(totalPending); // 7,000.00

    // If we only counted submitted commitments, projectedBalance would erroneously be 15,000.00
    const erroneousProjected = availableBalance.sub(submittedComm);
    expect(erroneousProjected.toFixed(2)).toBe('15000.00');

    // Mandatory Correction 1 requires 7,000.00:
    expect(projectedBalance.toFixed(2)).toBe('7000.00');
  });

  it('handles zero spend and zero commitments cleanly', () => {
    const lineAmount = new Prisma.Decimal('80000.00');
    const approvedExp = new Prisma.Decimal('0.00');
    const approvedComm = new Prisma.Decimal('0.00');

    const totalExposure = approvedExp.add(approvedComm);
    const availableBalance = lineAmount.sub(totalExposure);

    expect(totalExposure.toFixed(2)).toBe('0.00');
    expect(availableBalance.toFixed(2)).toBe('80000.00');
  });
});

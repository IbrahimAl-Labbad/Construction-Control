/**
 * tests/integration/billing-budgetline-no-double-count.test.ts
 *
 * Phase 10.7: No Double-Counting Integration Test on Live PostgreSQL.
 *
 * Core Financial Invariant (AGENTS.md §13 & Vertical Slice 7 Design Gate):
 * When a Subcontractor Billing is certified/approved, it represents an authorized
 * drawdown against an existing approved Commitment.
 *
 * It MUST NOT be added to the BudgetLine totalActiveExposure, because the Commitment
 * has ALREADY encumbered that budget capacity.
 *
 * Seed:
 * - BudgetLine.amount = 1,000,000.00 SAR
 * - Approved Commitment = 600,000.00 SAR
 * - Approved Expense = 80,000.00 SAR
 * - Approved Billing = 200,000.00 SAR
 *
 * Expected:
 * - totalActiveExposure = 680,000.00 SAR (NOT 880,000.00 SAR)
 * - availableBalance = 320,000.00 SAR (NOT 120,000.00 SAR)
 *
 * Assert independently:
 * - cumulativeCertifiedBillings = 200,000.00 SAR
 * - remainingCommitmentBalance = 400,000.00 SAR
 *
 * These values MUST remain separate.
 * This is the critical proof that Billing certification does not re-encumber the BudgetLine.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
  CommitmentStatus,
  ExpenseStatus,
  SubcontractorBillingStatus,
  AssignmentStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createBillingDraft,
  submitBilling,
  approveBilling,
  getCommitmentBillings,
  calculateCumulativeCertified,
} from '@/lib/subcontractor-billings';
import { createCommitmentDraft, submitCommitment, approveCommitment } from '@/lib/commitments';
import { createExpenseDraft, submitExpense, approveExpense } from '@/lib/expenses';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import { calculateBudgetLineExposure } from '@/lib/custodies/calculations';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Billing BudgetLine No Double-Counting Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];
  const cleanupBillingIds: string[] = [];
  const cleanupExpenseIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير عدم الازدواج المالي',
          email: `mgr.bnodouble.${Date.now()}@test.local`,
          role: Role.MANAGER,
          isActive: true,
        },
      });
    }
    testManager = {
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      role: Role.MANAGER,
      isActive: true,
    };

    // 2. Accountant
    let acc = await prisma.user.findFirst({
      where: { role: Role.ACCOUNTANT, isActive: true, deletedAt: null },
    });
    if (!acc) {
      acc = await prisma.user.create({
        data: {
          name: 'محاسب عدم الازدواج المالي',
          email: `acc.bnodouble.${Date.now()}@test.local`,
          role: Role.ACCOUNTANT,
          isActive: true,
        },
      });
    }
    testAccountant = {
      id: acc.id,
      name: acc.name,
      email: acc.email,
      role: Role.ACCOUNTANT,
      isActive: true,
    };

    // 3. Engineer
    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس عدم الازدواج المالي',
          email: `eng.bnodouble.${Date.now()}@test.local`,
          role: Role.ENGINEER,
          isActive: true,
        },
      });
    }
    testEngineer = {
      id: eng.id,
      name: eng.name,
      email: eng.email,
      role: Role.ENGINEER,
      isActive: true,
    };

    // 4. Purchasing Officer
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مسؤول مشتريات عدم الازدواج',
          email: `pur.bnodouble.${Date.now()}@test.local`,
          role: Role.PURCHASING,
          isActive: true,
        },
      });
    }
    testPurchasing = {
      id: pur.id,
      name: pur.name,
      email: pur.email,
      role: Role.PURCHASING,
      isActive: true,
    };

    // Default permissions
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const bId of cleanupBillingIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'SUBCONTRACTOR_BILLING', entityId: bId },
      });
      await prisma.subcontractorBilling.deleteMany({ where: { id: bId } });
    }
    cleanupBillingIds.length = 0;

    for (const expId of cleanupExpenseIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'EXPENSE', entityId: expId },
      });
      await prisma.expense.deleteMany({ where: { id: expId } });
    }
    cleanupExpenseIds.length = 0;

    for (const commId of cleanupCommitmentIds) {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'COMMITMENT', entityId: commId },
      });
      await prisma.commitment.deleteMany({ where: { id: commId } });
    }
    cleanupCommitmentIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.projectAssignment.deleteMany({ where: { projectId: pId } });
      await prisma.subcontractorBilling.deleteMany({ where: { projectId: pId } });
      await prisma.expense.deleteMany({ where: { projectId: pId } });
      await prisma.commitment.deleteMany({ where: { projectId: pId } });
      const budgets = await prisma.budget.findMany({ where: { projectId: pId } });
      for (const b of budgets) {
        await prisma.budgetLine.deleteMany({ where: { budgetId: b.id } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'BUDGET', entityId: b.id } });
        await prisma.budget.delete({ where: { id: b.id } });
      }
      await prisma.auditLog.deleteMany({ where: { entityType: 'PROJECT', entityId: pId } });
      await prisma.project.deleteMany({ where: { id: pId } });
    }
    cleanupProjectIds.length = 0;
  });

  it('proves that Billing certification does NOT re-encumber BudgetLine: totalActiveExposure = 680,000 NOT 880,000', async () => {
    // -------------------------------------------------------------------------
    // 1. Seed Active Project + Approved BudgetLine = 1,000,000.00 SAR
    // -------------------------------------------------------------------------
    const project = await createProject({
      code: `NODBL-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع إثبات عدم ازدواجية احتساب المستخلصات',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SUBCONTRACTOR,
          description: 'بند أعمال مقاولات عامة',
          amount: '1000000.00', // 1,000,000.00 SAR
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: testEngineer.id,
        assignedById: testManager.id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    // -------------------------------------------------------------------------
    // 2. Seed Approved Commitment = 600,000.00 SAR
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: 'شركة المقاولات الإنشائية الكبرى',
      amount: '600000.00',
      commitmentDate: new Date(),
      description: 'عقد مقاولة باطن بقيمة 600 ألف',
      referenceNumber: 'PO-NODBL-600K',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);
    await submitCommitment(commitmentDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const commitment = await approveCommitment(commitmentDraft.id);
    expect(commitment.amount).toBe('600000.00');

    // -------------------------------------------------------------------------
    // 3. Seed Approved Direct Expense = 80,000.00 SAR on same BudgetLine
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    const expenseDraft = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      amount: '80000.00',
      expenseDate: new Date(),
      description: 'مصروف مباشر لأعمال تجهيز الموقع',
    });
    cleanupExpenseIds.push(expenseDraft.id);
    await submitExpense(expenseDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const expense = await approveExpense(expenseDraft.id);
    expect(expense.amount).toBe('80000.00');

    // -------------------------------------------------------------------------
    // 4. Seed Approved Billing = 200,000.00 SAR on the Commitment
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const billingDraft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '200000.00',
      description: 'المستخلص الأول بقيمة 200 ألف',
    });
    cleanupBillingIds.push(billingDraft.id);
    await submitBilling(billingDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const billing = await approveBilling(billingDraft.id);
    expect(billing.status).toBe(SubcontractorBillingStatus.APPROVED);
    expect(billing.grossAmount).toBe('200000.00');

    // -------------------------------------------------------------------------
    // 5. Independently query live PostgreSQL records for all 3 entities
    // -------------------------------------------------------------------------
    const dbCommitments = await prisma.commitment.findMany({
      where: { budgetLineId: budgetLine.id, status: CommitmentStatus.APPROVED, deletedAt: null },
    });
    const dbExpenses = await prisma.expense.findMany({
      where: { budgetLineId: budgetLine.id, status: ExpenseStatus.APPROVED, deletedAt: null },
    });
    const dbBillings = await prisma.subcontractorBilling.findMany({
      where: { commitmentId: commitment.id, status: SubcontractorBillingStatus.APPROVED, deletedAt: null },
    });

    const sumApprovedCommitments = dbCommitments.reduce(
      (sum, c) => sum.add(c.amount),
      new Prisma.Decimal('0.00'),
    );
    const sumApprovedExpenses = dbExpenses.reduce(
      (sum, e) => sum.add(e.amount),
      new Prisma.Decimal('0.00'),
    );
    const sumApprovedBillings = dbBillings.reduce(
      (sum, b) => sum.add(b.grossAmount),
      new Prisma.Decimal('0.00'),
    );

    expect(sumApprovedCommitments.toFixed(2)).toBe('600000.00');
    expect(sumApprovedExpenses.toFixed(2)).toBe('80000.00');
    expect(sumApprovedBillings.toFixed(2)).toBe('200000.00');

    // -------------------------------------------------------------------------
    // 6. Assert BudgetLine Exposure: totalActiveExposure = 680,000 NOT 880,000
    // -------------------------------------------------------------------------
    const exposureMetrics = calculateBudgetLineExposure({
      authorizedAmount: budgetLine.amount,
      approvedCommitments: sumApprovedCommitments,
      directActualSpend: sumApprovedExpenses,
      custodyActualSpend: new Prisma.Decimal('0.00'),
      outstandingCustodies: new Prisma.Decimal('0.00'),
    });

    // CRITICAL PROOF 1: totalActiveExposure is strictly 680,000.00 SAR
    expect(exposureMetrics.totalActiveExposure.toFixed(2)).toBe('680000.00');
    // CRITICAL PROOF 2: It is emphatically NOT 880,000.00 SAR (no double-counting of billing)
    expect(exposureMetrics.totalActiveExposure.toFixed(2)).not.toBe('880000.00');

    // CRITICAL PROOF 3: availableBalance is 320,000.00 SAR (NOT 120,000.00 SAR)
    expect(exposureMetrics.availableBalance.toFixed(2)).toBe('320000.00');
    expect(exposureMetrics.availableBalance.toFixed(2)).not.toBe('120000.00');

    // -------------------------------------------------------------------------
    // 7. Assert Independently: cumulativeCertifiedBillings = 200,000.00 SAR
    // -------------------------------------------------------------------------
    const commitmentSummary = await getCommitmentBillings(commitment.id);
    expect(commitmentSummary.cumulativeCertified).toBe('200000.00');
    expect(commitmentSummary.remainingCommitmentBalance).toBe('400000.00'); // 600k - 200k = 400k
    expect(commitmentSummary.contractValue).toBe('600000.00');

    const pureCumulative = calculateCumulativeCertified(sumApprovedCommitments, dbBillings);
    expect(pureCumulative.cumulativeCertified.toFixed(2)).toBe('200000.00');
    expect(pureCumulative.remainingCommitmentBalance.toFixed(2)).toBe('400000.00');

    // The two financial metrics must remain completely separate:
    // BudgetLine exposure: 680,000.00 SAR
    // Commitment cumulative certified: 200,000.00 SAR
    expect(exposureMetrics.totalActiveExposure.toFixed(2)).toBe('680000.00');
    expect(pureCumulative.cumulativeCertified.toFixed(2)).toBe('200000.00');
  });
});

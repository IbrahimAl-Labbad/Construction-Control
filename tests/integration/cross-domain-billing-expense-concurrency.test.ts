/**
 * tests/integration/cross-domain-billing-expense-concurrency.test.ts
 *
 * Phase 10.8: Cross-Domain Concurrency Integration Test on Live PostgreSQL (Billing vs Expense).
 *
 * Verifies canonical lock ordering & zero-deadlock concurrency between:
 *   - Subcontractor Billing approval (locks budget_lines -> commitments -> billings)
 *   - Expense approval (locks budget_lines)
 * on the SAME BudgetLine X.
 *
 * Requirements:
 * 1. No deadlock occurs between the two transaction pipelines.
 * 2. Both transactions cleanly terminate.
 * 3. Each domain strictly enforces its own ceiling:
 *    - Expense enforces BudgetLine.amount ceiling: (Commitments + Expenses <= BudgetLine.amount).
 *    - Billing enforces Commitment.amount ceiling: (SUM(Billings) <= Commitment.amount).
 * 4. Final totalActiveExposure never exceeds BudgetLine.amount.
 * 5. Canonical lock ordering (budget_lines first) guarantees deterministic serial execution.
 * 6. If one operation fails its own ceiling, the other completes and leaves the database in a valid state.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Role,
  ProjectStatus,
  BudgetCategory,
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
} from '@/lib/subcontractor-billings';
import { createCommitmentDraft, submitCommitment, approveCommitment } from '@/lib/commitments';
import { createExpenseDraft, submitExpense, approveExpense } from '@/lib/expenses';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import { calculateBudgetLineExposure } from '@/lib/custodies/calculations';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Cross-Domain Concurrency (Billing vs Expense on Live PostgreSQL)', () => {
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
          name: 'مدير سباق المستخلصات والمصروفات',
          email: `mgr.cross.bexp.${Date.now()}@test.local`,
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
          name: 'محاسب سباق المستخلصات والمصروفات',
          email: `acc.cross.bexp.${Date.now()}@test.local`,
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
          name: 'مهندس سباق المستخلصات والمصروفات',
          email: `eng.cross.bexp.${Date.now()}@test.local`,
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
          name: 'مسؤول مشتريات سباق النطاقات',
          email: `pur.cross.bexp.${Date.now()}@test.local`,
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

    // Manager default approval mocks
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

  /** Helper to setup active project, approved budget, and approved commitment */
  async function setupCrossDomainEnvironment(params: {
    budgetLineAmount: string;
    commitmentAmount: string;
  }) {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const project = await createProject({
      code: `XRACE-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار تزامن المستخلصات مع المصروفات',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SUBCONTRACTOR,
          description: 'بند المقاولات المشترك',
          amount: params.budgetLineAmount,
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

    // Purchasing creates and submits commitment
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testPurchasing);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testPurchasing);

    const commitmentDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      vendorName: 'شركة المقاولات الإنشائية للتزامن',
      amount: params.commitmentAmount,
      commitmentDate: new Date(),
      description: 'عقد مقاولة باطن لمشروع التزامن المشترك',
      referenceNumber: 'PO-XRACE-01',
    });
    cleanupCommitmentIds.push(commitmentDraft.id);
    await submitCommitment(commitmentDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    const approvedComm = await approveCommitment(commitmentDraft.id);

    return { project, budgetLine, commitment: approvedComm };
  }

  it('proves concurrent Billing and Expense approvals on the same BudgetLine terminate without deadlock and both succeed when within limits', async () => {
    // -------------------------------------------------------------------------
    // BudgetLine = 1,000,000.00 SAR
    // Approved Commitment = 500,000.00 SAR (encumbers 500k of 1M)
    // Billing = 300,000.00 SAR (draws against 500k commitment, within ceiling)
    // Expense = 400,000.00 SAR (adds to 500k on BudgetLine: 500k + 400k = 900k <= 1,000,000 ceiling)
    // -------------------------------------------------------------------------
    const { project, budgetLine, commitment } = await setupCrossDomainEnvironment({
      budgetLineAmount: '1000000.00',
      commitmentAmount: '500000.00',
    });

    // Seed SUBMITTED Billing of 300,000.00 SAR
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const billingDraft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '300000.00',
      description: 'مستخلص متزامن 300 ألف',
    });
    cleanupBillingIds.push(billingDraft.id);
    await submitBilling(billingDraft.id);

    // Seed SUBMITTED Expense of 400,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    const expenseDraft = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      amount: '400000.00',
      expenseDate: new Date(),
      description: 'مصروف متزامن 400 ألف',
    });
    cleanupExpenseIds.push(expenseDraft.id);
    await submitExpense(expenseDraft.id);

    // Concurrently dispatch approvals
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const [billingResult, expenseResult] = await Promise.allSettled([
      approveBilling(billingDraft.id),
      approveExpense(expenseDraft.id),
    ]);

    // Both must terminate cleanly without deadlock and both must fulfill
    expect(billingResult.status).toBe('fulfilled');
    expect(expenseResult.status).toBe('fulfilled');

    // Verify DB state
    const dbBilling = await prisma.subcontractorBilling.findUniqueOrThrow({
      where: { id: billingDraft.id },
    });
    const dbExpense = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseDraft.id },
    });

    expect(dbBilling.status).toBe(SubcontractorBillingStatus.APPROVED);
    expect(dbExpense.status).toBe(ExpenseStatus.APPROVED);

    // Final totalActiveExposure on BudgetLine:
    // 500,000 (Commitment) + 400,000 (Expense) = 900,000.00 SAR <= 1,000,000.00 SAR
    // Billing does NOT add to totalActiveExposure!
    const exposure = calculateBudgetLineExposure({
      authorizedAmount: budgetLine.amount,
      approvedCommitments: new Prisma.Decimal(commitment.amount),
      directActualSpend: dbExpense.amount,
      custodyActualSpend: new Prisma.Decimal('0.00'),
      outstandingCustodies: new Prisma.Decimal('0.00'),
    });

    expect(exposure.totalActiveExposure.toFixed(2)).toBe('900000.00');
    expect(exposure.totalActiveExposure.lessThanOrEqualTo(budgetLine.amount)).toBe(true);

    // Cumulative certified billing on Commitment = 300,000.00 SAR <= 500,000.00 SAR
    const summary = await getCommitmentBillings(commitment.id);
    expect(summary.cumulativeCertified).toBe('300000.00');
    expect(summary.remainingCommitmentBalance).toBe('200000.00');
  });

  it('proves concurrent execution when Expense breaches BudgetLine ceiling: Billing succeeds, Expense is rejected, and DB remains valid', async () => {
    // -------------------------------------------------------------------------
    // BudgetLine = 1,000,000.00 SAR
    // Approved Commitment = 800,000.00 SAR (already encumbers 800k of 1M)
    // Billing = 400,000.00 SAR (within 800k commitment ceiling)
    // Expense = 300,000.00 SAR (800k + 300k = 1,100,000.00 > 1,000,000.00 ceiling!)
    // -------------------------------------------------------------------------
    const { project, budgetLine, commitment } = await setupCrossDomainEnvironment({
      budgetLineAmount: '1000000.00',
      commitmentAmount: '800000.00',
    });

    // Seed SUBMITTED Billing of 400,000.00 SAR
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const billingDraft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '400000.00',
      description: 'مستخلص مقبول 400 ألف',
    });
    cleanupBillingIds.push(billingDraft.id);
    await submitBilling(billingDraft.id);

    // Seed SUBMITTED Expense of 300,000.00 SAR (will breach BudgetLine)
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    const expenseDraft = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      amount: '300000.00',
      expenseDate: new Date(),
      description: 'مصروف يتجاوز سقف البند المتبقي (200 ألف متبقية)',
    });
    cleanupExpenseIds.push(expenseDraft.id);
    await submitExpense(expenseDraft.id);

    // Concurrently dispatch approvals
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const [billingResult, expenseResult] = await Promise.allSettled([
      approveBilling(billingDraft.id),
      approveExpense(expenseDraft.id),
    ]);

    // 1. Both terminate cleanly (No deadlock!)
    // 2. Billing succeeds (within its own commitment ceiling)
    expect(billingResult.status).toBe('fulfilled');
    // 3. Expense fails with BUDGET_LINE_EXCEEDED (breaches its own budget line ceiling)
    expect(expenseResult.status).toBe('rejected');

    const expenseRejection = (expenseResult as PromiseRejectedResult).reason;
    expect(expenseRejection).toBeDefined();
    expect(expenseRejection.code).toBe('BUDGET_LINE_EXCEEDED');

    // 4. Final DB verification:
    // Billing is APPROVED
    const dbBilling = await prisma.subcontractorBilling.findUniqueOrThrow({
      where: { id: billingDraft.id },
    });
    expect(dbBilling.status).toBe(SubcontractorBillingStatus.APPROVED);

    // Expense remains SUBMITTED (rolled back)
    const dbExpense = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseDraft.id },
    });
    expect(dbExpense.status).toBe(ExpenseStatus.SUBMITTED);
    expect(dbExpense.approvedById).toBeNull();

    // 5. Final totalActiveExposure never exceeds BudgetLine.amount (strictly 800,000.00 SAR)
    const approvedExpenses = await prisma.expense.findMany({
      where: { budgetLineId: budgetLine.id, status: ExpenseStatus.APPROVED, deletedAt: null },
    });
    const sumExpenses = approvedExpenses.reduce(
      (sum, e) => sum.add(e.amount),
      new Prisma.Decimal('0.00'),
    );

    const finalExposure = calculateBudgetLineExposure({
      authorizedAmount: budgetLine.amount,
      approvedCommitments: new Prisma.Decimal(commitment.amount),
      directActualSpend: sumExpenses,
      custodyActualSpend: new Prisma.Decimal('0.00'),
      outstandingCustodies: new Prisma.Decimal('0.00'),
    });

    expect(finalExposure.totalActiveExposure.toFixed(2)).toBe('800000.00');
    expect(finalExposure.totalActiveExposure.lessThanOrEqualTo(budgetLine.amount)).toBe(true);
  });

  it('proves concurrent execution when Billing breaches Commitment ceiling: Expense succeeds, Billing is rejected, and DB remains valid', async () => {
    // -------------------------------------------------------------------------
    // BudgetLine = 1,000,000.00 SAR
    // Approved Commitment = 400,000.00 SAR
    // Billing = 500,000.00 SAR (exceeds 400k commitment ceiling!)
    // Expense = 200,000.00 SAR (400k commitment + 200k expense = 600k <= 1M ceiling)
    // -------------------------------------------------------------------------
    const { project, budgetLine, commitment } = await setupCrossDomainEnvironment({
      budgetLineAmount: '1000000.00',
      commitmentAmount: '400000.00',
    });

    // Seed SUBMITTED Billing of 500,000.00 SAR (exceeds commitment ceiling)
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testAccountant);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testAccountant);

    const billingDraft = await createBillingDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      commitmentId: commitment.id,
      subcontractorName: commitment.vendorName,
      billingPeriod: '2026-03',
      claimDate: new Date('2026-03-15'),
      grossAmount: '500000.00',
      description: 'مستخلص يتجاوز سقف الالتزام (400 ألف)',
    });
    cleanupBillingIds.push(billingDraft.id);
    await submitBilling(billingDraft.id);

    // Seed SUBMITTED Expense of 200,000.00 SAR (within BudgetLine ceiling)
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    const expenseDraft = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      amount: '200000.00',
      expenseDate: new Date(),
      description: 'مصروف مقبول 200 ألف',
    });
    cleanupExpenseIds.push(expenseDraft.id);
    await submitExpense(expenseDraft.id);

    // Concurrently dispatch approvals
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    const [billingResult, expenseResult] = await Promise.allSettled([
      approveBilling(billingDraft.id),
      approveExpense(expenseDraft.id),
    ]);

    // 1. Both terminate cleanly (No deadlock!)
    // 2. Billing rejected with COMMITMENT_CEILING_EXCEEDED
    expect(billingResult.status).toBe('rejected');
    const billingRejection = (billingResult as PromiseRejectedResult).reason;
    expect(billingRejection).toBeDefined();
    expect(billingRejection.code).toBe('COMMITMENT_CEILING_EXCEEDED');

    // 3. Expense fulfilled (APPROVED)
    expect(expenseResult.status).toBe('fulfilled');

    // 4. Final DB verification:
    // Billing remains SUBMITTED (rolled back)
    const dbBilling = await prisma.subcontractorBilling.findUniqueOrThrow({
      where: { id: billingDraft.id },
    });
    expect(dbBilling.status).toBe(SubcontractorBillingStatus.SUBMITTED);
    expect(dbBilling.approvedById).toBeNull();

    // Expense is APPROVED
    const dbExpense = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseDraft.id },
    });
    expect(dbExpense.status).toBe(ExpenseStatus.APPROVED);

    // 5. Final totalActiveExposure on BudgetLine:
    // 400,000 (Commitment) + 200,000 (Expense) = 600,000.00 SAR <= 1,000,000.00 SAR
    const finalExposure = calculateBudgetLineExposure({
      authorizedAmount: budgetLine.amount,
      approvedCommitments: new Prisma.Decimal(commitment.amount),
      directActualSpend: dbExpense.amount,
      custodyActualSpend: new Prisma.Decimal('0.00'),
      outstandingCustodies: new Prisma.Decimal('0.00'),
    });

    expect(finalExposure.totalActiveExposure.toFixed(2)).toBe('600000.00');
    expect(finalExposure.totalActiveExposure.lessThanOrEqualTo(budgetLine.amount)).toBe(true);
  });
});

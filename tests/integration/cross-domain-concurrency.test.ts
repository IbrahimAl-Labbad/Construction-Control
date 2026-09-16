/**
 * tests/integration/cross-domain-concurrency.test.ts
 *
 * Cross-Domain Concurrency integration test on live PostgreSQL (Expense vs Commitment):
 * Proves Assertion B & Joint Financial Concurrency Invariant:
 * 1. Seeds an active project with an approved budget line of 10,000.00 SAR.
 * 2. Seeds one SUBMITTED Expense of 7,000.00 SAR (Slice 4).
 * 3. Seeds one SUBMITTED Commitment of 7,000.00 SAR (Slice 5).
 *    (Combined requested exposure = 14,000.00 SAR > 10,000.00 SAR ceiling).
 * 4. Dispatches genuinely concurrent approveExpense and approveCommitment transactions in parallel.
 * 5. Proves BudgetLine row-level locking (SELECT ... FOR UPDATE) serializes across domains.
 * 6. Proves exactly one approval succeeds and the other fails with BUDGET_LINE_EXCEEDED.
 * 7. Independently queries PostgreSQL after the race condition and proves:
 *    SUM(APPROVED expenses) + SUM(APPROVED commitments) <= BudgetLine.amount (strictly 7,000.00 SAR).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetCategory, ExpenseStatus, CommitmentStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { approveExpense } from '@/lib/expenses';
import { approveCommitment } from '@/lib/commitments';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Cross-Domain Concurrency (Expense vs Commitment on Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupExpenseIds: string[] = [];
  const cleanupCommitmentIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير سباق النطاقات المشتركة',
          email: `mgr.cross.race.${Date.now()}@test.local`,
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

    // 2. Engineer
    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس سباق النطاقات',
          email: `eng.cross.race.${Date.now()}@test.local`,
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

    // 3. Purchasing Officer
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مسؤول مشتريات سباق النطاقات',
          email: `pur.cross.race.${Date.now()}@test.local`,
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

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const expId of cleanupExpenseIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE', entityId: expId } });
      await prisma.expense.deleteMany({ where: { id: expId } });
    }
    cleanupExpenseIds.length = 0;

    for (const commId of cleanupCommitmentIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'COMMITMENT', entityId: commId } });
      await prisma.commitment.deleteMany({ where: { id: commId } });
    }
    cleanupCommitmentIds.length = 0;

    for (const pId of cleanupProjectIds) {
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

  it('proves BudgetLine FOR UPDATE lock serializes Expense and Commitment approvals and prevents combined overspend', async () => {
    // 1. Setup Active Project with Approved Budget
    const project = await createProject({
      code: `CROSS-RACE-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار التزامن المشترك بين المصروفات والالتزامات',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    // Budget Line ceiling = 10,000.00 SAR
    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'بند التوريدات المشتركة',
          amount: '10000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    // 2. Seed SUBMITTED Expense of 7,000.00 SAR
    const expense = await prisma.expense.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('7000.00'),
        currency: 'SAR',
        description: 'مصروف توريد مباشر للموقع',
        expenseDate: new Date(),
        status: ExpenseStatus.SUBMITTED,
        submittedById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expense.id);

    // 3. Seed SUBMITTED Commitment of 7,000.00 SAR
    const commitment = await prisma.commitment.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('7000.00'),
        currency: 'SAR',
        vendorName: 'مورد أمر الشراء',
        description: 'أمر شراء تعاقدي قيد الاعتماد',
        commitmentDate: new Date(),
        status: CommitmentStatus.SUBMITTED,
        createdById: testPurchasing.id,
        submittedById: testPurchasing.id,
        submittedAt: new Date(),
      },
    });
    cleanupCommitmentIds.push(commitment.id);

    // 4. Dispatch genuinely concurrent cross-domain approvals in parallel
    const [expenseResult, commitmentResult] = await Promise.allSettled([
      approveExpense(expense.id),
      approveCommitment(commitment.id),
    ]);

    // 5. Prove: Exactly one succeeded and one failed with BUDGET_LINE_EXCEEDED
    const fulfilled = [expenseResult, commitmentResult].filter((r) => r.status === 'fulfilled');
    const rejected = [expenseResult, commitmentResult].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeDefined();
    expect(rejectionReason.code).toBe('BUDGET_LINE_EXCEEDED');

    // 6. Independently query PostgreSQL to verify combined exposure
    const approvedExpenses = await prisma.expense.findMany({
      where: { budgetLineId: budgetLine.id, status: ExpenseStatus.APPROVED, deletedAt: null },
    });
    const approvedCommitments = await prisma.commitment.findMany({
      where: { budgetLineId: budgetLine.id, status: CommitmentStatus.APPROVED, deletedAt: null },
    });

    const totalApprovedExpenseSpend = approvedExpenses.reduce(
      (sum, e) => sum.add(e.amount),
      new Prisma.Decimal('0.00'),
    );
    const totalApprovedCommitmentSpend = approvedCommitments.reduce(
      (sum, c) => sum.add(c.amount),
      new Prisma.Decimal('0.00'),
    );

    const combinedApprovedExposure = totalApprovedExpenseSpend.add(totalApprovedCommitmentSpend);

    // CRITICAL PROOF OF FINANCIAL SAFETY (Assertion B):
    // Combined approved exposure cannot breach 10,000.00 SAR!
    expect(combinedApprovedExposure.toNumber()).toBe(7000.0);
    expect(combinedApprovedExposure.lessThanOrEqualTo(budgetLine.amount)).toBe(true);
  });
});

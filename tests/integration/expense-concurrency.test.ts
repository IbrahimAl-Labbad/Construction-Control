/**
 * tests/integration/expense-concurrency.test.ts
 *
 * Concurrency integration tests on live PostgreSQL:
 * Proves Gates 4, 5, 25, 26, 27, 41, 42, 43:
 * 1. Seeds an active project with an approved budget line of 10,000.00 SAR.
 * 2. Seeds two SUBMITTED expenses on this line for 8,000.00 SAR each (Total = 16,000.00 SAR).
 * 3. Dispatches two genuinely concurrent approveExpense transactions in parallel using Promise.allSettled.
 * 4. Proves PostgreSQL row-level locking (SELECT ... FOR UPDATE) serializes the approvals.
 * 5. Proves exactly one approval succeeds and the second fails with BUDGET_LINE_EXCEEDED.
 * 6. Independently queries PostgreSQL after the race condition and proves:
 *    SUM(APPROVED expenses) <= BudgetLine.amount (strictly 8,000.00 SAR).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetCategory, ExpenseStatus, AssignmentStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { createExpenseDraft, updateExpenseDraft, submitExpense, approveExpense } from '@/lib/expenses';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Expense Concurrency & Overspend Prevention (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupExpenseIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير سباق الاعتماد',
          email: `mgr.race.${Date.now()}@test.local`,
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

    // 2. Engineer (Submitter)
    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس سباق الاعتماد',
          email: `eng.race.${Date.now()}@test.local`,
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

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const expId of cleanupExpenseIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE', entityId: expId } });
      await prisma.expense.deleteMany({ where: { id: expId } });
    }
    cleanupExpenseIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.projectAssignment.deleteMany({ where: { projectId: pId } });
      await prisma.expense.deleteMany({ where: { projectId: pId } });
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

  it('proves BudgetLine FOR UPDATE lock prevents overspending under concurrent approvals', async () => {
    // 1. Setup Active Project with Approved Budget
    const project = await createProject({
      code: `CONC-PRJ-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار التزامن المالي',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    // Line ceiling = exactly 10,000.00 SAR
    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SITE_OPERATIONS,
          description: 'مصاريف حراسة الموقع',
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

    // 2. Seed TWO submitted expenses of 8,000.00 SAR each (Total = 16,000.00 SAR > 10,000.00 SAR)
    const expenseA = await prisma.expense.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('8000.00'),
        currency: 'SAR',
        description: 'دفعة حراسة الموقع - الفترة الأولى',
        expenseDate: new Date(),
        status: ExpenseStatus.SUBMITTED,
        submittedById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expenseA.id);

    const expenseB = await prisma.expense.create({
      data: {
        projectId: project.id,
        budgetLineId: budgetLine.id,
        amount: new Prisma.Decimal('8000.00'),
        currency: 'SAR',
        description: 'دفعة حراسة الموقع - الفترة الثانية',
        expenseDate: new Date(),
        status: ExpenseStatus.SUBMITTED,
        submittedById: testEngineer.id,
        submittedAt: new Date(),
      },
    });
    cleanupExpenseIds.push(expenseB.id);

    // 3. Dispatch genuinely concurrent approvals in parallel (Gate 41)
    const [resultA, resultB] = await Promise.allSettled([
      approveExpense(expenseA.id),
      approveExpense(expenseB.id),
    ]);

    // 4. Prove: Exactly one succeeded and one failed with BUDGET_LINE_EXCEEDED (Gate 42)
    const fulfilled = [resultA, resultB].filter((r) => r.status === 'fulfilled');
    const rejected = [resultA, resultB].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeDefined();
    expect(rejectionReason.code).toBe('BUDGET_LINE_EXCEEDED');

    // 5. Independently query live PostgreSQL to prove final DB state (Gate 43)
    const dbExpenses = await prisma.expense.findMany({
      where: { budgetLineId: budgetLine.id, deletedAt: null },
    });

    const approvedExpenses = dbExpenses.filter((e) => e.status === ExpenseStatus.APPROVED);
    expect(approvedExpenses.length).toBe(1);

    const totalApprovedSpend = approvedExpenses.reduce(
      (sum, e) => sum.add(e.amount),
      new Prisma.Decimal('0.00'),
    );

    // CRITICAL FINANCIAL PROOF: total approved spend <= budgetLine.amount
    expect(totalApprovedSpend.toNumber()).toBe(8000.0);
    expect(totalApprovedSpend.lessThanOrEqualTo(budgetLine.amount)).toBe(true);

    const nonApproved = dbExpenses.filter((e) => e.status !== ExpenseStatus.APPROVED);
    expect(nonApproved.length).toBe(1);
    expect(nonApproved[0]?.status).toBe(ExpenseStatus.SUBMITTED); // Remains submitted, not approved!
  });

  it('Race A (Slice 21A): concurrent updateExpenseDraft and submitExpense on the same expense serialize safely without stale linkage or post-submit mutation', async () => {
    // 1. Setup Active Project with TWO Approved Budget Lines
    const project = await createProject({
      code: `CONC-21A-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار سباق تحديث وتقديم المسودة',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SITE_OPERATIONS,
          description: 'بند التشغيل الأول',
          amount: '25000.00',
        },
        {
          category: BudgetCategory.MATERIALS,
          description: 'بند المواد الثاني',
          amount: '25000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    const approvedBudget = await approveBudget(budgetDraft.id);
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: testEngineer.id,
        assignedById: testManager.id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    const line1 = approvedBudget.lines[0]!;
    const line2 = approvedBudget.lines[1]!;

    // 2. Engineer creates a DRAFT expense on line1 for 2,000.00 SAR
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: line1.id,
      amount: '2000.00',
      expenseDate: '2026-04-01',
      description: 'مسودة مصروف أولية على البند الأول',
    });
    cleanupExpenseIds.push(draft.id);

    // 3. Concurrently dispatch updateExpenseDraft (switching to line2 and 4,500.00 SAR) and submitExpense
    const [updateRes, submitRes] = await Promise.allSettled([
      updateExpenseDraft(draft.id, {
        budgetLineId: line2.id,
        amount: '4500.00',
        expenseDate: '2026-04-02',
        description: 'مسودة مصروف محدثة على البند الثاني',
      }),
      submitExpense(draft.id),
    ]);

    // 4. Verify serialized outcome:
    // Case 1: updateExpenseDraft committed first -> submitExpense re-read under lock, retried linkage, and submitted the updated values (4,500.00 SAR on line2).
    // Case 2: submitExpense committed first -> updateExpenseDraft observed SUBMITTED under lock and rejected with EXPENSE_NOT_DRAFT; DB retains 2,000.00 SAR on line1.
    expect(submitRes.status).toBe('fulfilled');

    const finalExpense = await prisma.expense.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(finalExpense.status).toBe(ExpenseStatus.SUBMITTED);

    const submitAuditLog = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'EXPENSE', entityId: draft.id, action: 'EXPENSE_SUBMITTED' },
      orderBy: { createdAt: 'desc' },
    });
    const auditMeta = submitAuditLog.metadata as Record<string, unknown>;

    if (updateRes.status === 'fulfilled') {
      expect(finalExpense.budgetLineId).toBe(line2.id);
      expect(finalExpense.amount.toFixed(2)).toBe('4500.00');
      expect(finalExpense.description).toBe('مسودة مصروف محدثة على البند الثاني');
      // Audit log recorded by submitExpense must match the fresh locked values, not stale pre-read values
      expect(auditMeta['budgetLineId']).toBe(line2.id);
      expect(auditMeta['amount']).toBe('4500.00');
    } else {
      expect(updateRes.reason.code).toBe('EXPENSE_NOT_DRAFT');
      expect(finalExpense.budgetLineId).toBe(line1.id);
      expect(finalExpense.amount.toFixed(2)).toBe('2000.00');
      expect(auditMeta['budgetLineId']).toBe(line1.id);
      expect(auditMeta['amount']).toBe('2000.00');
    }
  });
});

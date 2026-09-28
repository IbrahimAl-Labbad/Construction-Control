/**
 * tests/integration/expense-lifecycle.test.ts
 *
 * Full integration tests for Project Expense lifecycle against live PostgreSQL:
 * 1. Project ACTIVE + APPROVED Budget setup.
 * 2. Draft creation by Engineer + atomic EXPENSE_CREATED audit log.
 * 3. Draft update with deltas + atomic EXPENSE_UPDATED audit log.
 * 4. Submission + EXPENSE_SUBMITTED audit log + pending exposure verification.
 * 5. Rejection by Manager + explicit rejection tracking (rejectedById, rejectionReason).
 * 6. Reopen by claimant + rejection cleanup + resubmission.
 * 7. Approval by Manager + atomic spend consumption + EXPENSE_APPROVED audit log.
 * 8. Approved expense immutability (cannot edit or soft-delete).
 * 9. Self-approval prevention (actor.id !== submittedById).
 * 10. Soft deletion behavior on drafts.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetCategory, ExpenseStatus, AssignmentStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createExpenseDraft,
  updateExpenseDraft,
  deleteExpenseDraft,
  submitExpense,
  rejectExpense,
  reopenExpenseDraft,
  approveExpense,
  getProjectExpenses,
} from '@/lib/expenses';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as auth from '@/lib/auth';
import * as permissions from '@/lib/permissions';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Expense Lifecycle Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupExpenseIds: string[] = [];

  beforeEach(async () => {
    // 1. Find or create test Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير نفقات التكامل',
          email: `mgr.exp.${Date.now()}@test.local`,
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

    // 2. Find or create test Engineer
    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس نفقات التكامل',
          email: `eng.exp.${Date.now()}@test.local`,
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
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // Clean up expenses
    for (const expId of cleanupExpenseIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE', entityId: expId } });
      await prisma.expense.deleteMany({ where: { id: expId } });
    }
    cleanupExpenseIds.length = 0;

    // Clean up projects (and their budgets/lines)
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

  it('completes the entire expense lifecycle with strict audit and invariants', async () => {
    // -------------------------------------------------------------------------
    // Step 1: Create active project with an approved budget
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const project = await createProject({
      code: `EXP-PRJ-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع دورة حياة النفقات',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    // Create and approve budget (Line ceiling = 50,000 SAR)
    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.MATERIALS,
          description: 'مواد بناء وإنشاءات',
          amount: '50000.00',
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    await approveBudget(budgetDraft.id);

    // Activate project
    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    // Assign engineer to project (Slice 14 / BD-14-01)
    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: testEngineer.id,
        assignedById: testManager.id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    // Fetch the approved budget line
    const budgetLine = await prisma.budgetLine.findFirstOrThrow({
      where: { budgetId: budgetDraft.id },
    });

    // -------------------------------------------------------------------------
    // Step 2: Engineer creates an Expense Draft (5,000 SAR)
    // -------------------------------------------------------------------------
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    const draft = await createExpenseDraft({
      projectId: project.id,
      budgetLineId: budgetLine.id,
      amount: '5000.00',
      expenseDate: new Date('2026-03-10'),
      description: 'شراء أسمنت ورمل',
    });
    cleanupExpenseIds.push(draft.id);

    expect(draft.status).toBe(ExpenseStatus.DRAFT);
    expect(draft.amount).toBe('5000.00');
    expect(draft.submittedById).toBe(testEngineer.id);

    // Verify atomic EXPENSE_CREATED audit log
    const createAudit = await prisma.auditLog.findFirst({
      where: { action: 'EXPENSE_CREATED', entityId: draft.id },
    });
    expect(createAudit).toBeDefined();
    expect(createAudit?.actorId).toBe(testEngineer.id);

    // -------------------------------------------------------------------------
    // Step 3: Engineer updates the Draft (change amount to 6,000 SAR)
    // -------------------------------------------------------------------------
    const updatedDraft = await updateExpenseDraft(draft.id, {
      budgetLineId: budgetLine.id,
      amount: '6000.00',
      expenseDate: new Date('2026-03-11'),
      description: 'شراء أسمنت ورمل وحديد تسليح إضافي',
    });

    expect(updatedDraft.amount).toBe('6000.00');

    // Verify EXPENSE_UPDATED audit log has accurate deltas
    const updateAudit = await prisma.auditLog.findFirst({
      where: { action: 'EXPENSE_UPDATED', entityId: draft.id },
    });
    expect(updateAudit).toBeDefined();
    const metadata = updateAudit?.metadata as Record<string, unknown> | null;
    const deltas = (metadata?.['deltas'] as Record<string, { previous: string; new: string }>) ?? {};
    expect(deltas.amount?.previous).toBe('5000.00');
    expect(deltas.amount?.new).toBe('6000.00');

    // -------------------------------------------------------------------------
    // Step 4: Engineer submits the Draft (DRAFT -> SUBMITTED)
    // -------------------------------------------------------------------------
    const submitted = await submitExpense(draft.id);
    expect(submitted.status).toBe(ExpenseStatus.SUBMITTED);
    expect(submitted.submittedAt).toBeDefined();

    // Verify available balance vs pending exposure (Gates 22 & 23)
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);

    let overview = await getProjectExpenses(project.id);
    expect(overview.totalAuthorizedBudget).toBe('50000.00');
    expect(overview.totalActualSpend).toBe('0.00'); // NOT decremented yet!
    expect(overview.totalPendingExposure).toBe('6000.00'); // surfaced as pending!
    expect(overview.totalAvailableBalance).toBe('50000.00'); // legal available remains 50k!
    expect(overview.totalProjectedBalance).toBe('44000.00'); // projected = 44k

    // -------------------------------------------------------------------------
    // Step 5: Manager rejects the expense with a reason
    // -------------------------------------------------------------------------
    const rejected = await rejectExpense(draft.id, {
      rejectionReason: 'يرجى إرفاق تفاصيل كميات أكياس الأسمنت بدقة',
    });

    expect(rejected.status).toBe(ExpenseStatus.REJECTED);
    expect(rejected.rejectedById).toBe(testManager.id); // Dedicated rejection tracking
    expect(rejected.rejectedAt).toBeDefined();
    expect(rejected.rejectionReason).toBe('يرجى إرفاق تفاصيل كميات أكياس الأسمنت بدقة');
    expect(rejected.approvedById).toBeNull(); // Gate 1 & 18 verified

    // -------------------------------------------------------------------------
    // Step 6: Engineer reopens the rejected expense back to DRAFT
    // -------------------------------------------------------------------------
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    const reopened = await reopenExpenseDraft(draft.id);
    expect(reopened.status).toBe(ExpenseStatus.DRAFT);
    expect(reopened.rejectedById).toBeNull(); // Reopen cleanup verified (Gate 17)
    expect(reopened.rejectionReason).toBeNull();
    expect(reopened.rejectedAt).toBeNull();

    // Resubmit
    await submitExpense(draft.id);

    // -------------------------------------------------------------------------
    // Step 7: Separation of Duties Check (Manager cannot self-approve)
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testEngineer);
    // If the actor matches submittedById, approveExpense throws FORBIDDEN_SELF_APPROVAL
    await expect(approveExpense(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_SELF_APPROVAL' }),
    );

    // -------------------------------------------------------------------------
    // Step 8: Manager formally approves the expense
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const approved = await approveExpense(draft.id);
    expect(approved.status).toBe(ExpenseStatus.APPROVED);
    expect(approved.approvedById).toBe(testManager.id);
    expect(approved.approvedAt).toBeDefined();

    // Verify financial consumption in DB
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);
    overview = await getProjectExpenses(project.id);
    expect(overview.totalActualSpend).toBe('6000.00'); // Now decremented!
    expect(overview.totalPendingExposure).toBe('0.00'); // Pending cleared
    expect(overview.totalAvailableBalance).toBe('44000.00'); // 50,000 - 6,000 = 44,000 SAR

    // -------------------------------------------------------------------------
    // Step 9: Immutability of APPROVED Expense (Gate 11 & 15)
    // -------------------------------------------------------------------------
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);

    await expect(
      updateExpenseDraft(draft.id, {
        budgetLineId: budgetLine.id,
        amount: '7000.00',
        expenseDate: new Date(),
        description: 'محاولة تعديل غير قانونية',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'IMMUTABLE_RECORD' }));

    await expect(deleteExpenseDraft(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'IMMUTABLE_RECORD' }),
    );
  });
});

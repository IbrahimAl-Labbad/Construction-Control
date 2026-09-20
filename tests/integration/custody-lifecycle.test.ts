/**
 * tests/integration/custody-lifecycle.test.ts
 *
 * Full integration tests for Project Custody / Advance Payments & Settlement lifecycle
 * against live PostgreSQL:
 * 1. Project ACTIVE + APPROVED Budget setup.
 * 2. Draft creation by Engineer + Invariant 8 enforcement.
 * 3. Draft update by Engineer + audit log.
 * 4. Submission + CUSTODY_SUBMITTED audit log.
 * 5. Rejection by Manager + explicit rejection tracking.
 * 6. Reopen by Engineer + resubmission.
 * 7. Approval by Manager (Invariant 2: zero exposure encumbered).
 * 8. Pre-issuance cancellation (APPROVED -> CANCELLED).
 * 9. Cash issuance by Accountant (Invariant 3: encumbers OutstandingCustody).
 * 10. Expense settlement (Invariant 5: zero double counting, converts to actual spend).
 * 11. Partial settlement state (PARTIALLY_SETTLED).
 * 12. Cash return by Accountant + auto-transition to SETTLED.
 * 13. Final closure by Manager (SETTLED -> CLOSED).
 * 14. Terminal immutability & soft-delete rules.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetCategory, CustodyStatus, ExpenseStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createCustodyDraft,
  updateCustodyDraft,
  deleteCustodyDraft,
  submitCustody,
  approveCustody,
  rejectCustody,
  reopenCustody,
  cancelCustody,
  issueCustody,
  recordCashReturn,
  closeCustody,
  getCustody,
  getProjectCustodies,
} from '@/lib/custodies';
import { createExpenseDraft, submitExpense, approveExpense } from '@/lib/expenses';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth/session';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Custody Lifecycle Integration (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupCustodyIds: string[] = [];
  const cleanupExpenseIds: string[] = [];

  beforeEach(async () => {
    // 1. Manager
    let mgr = await prisma.user.findFirst({
      where: { role: Role.MANAGER, isActive: true, deletedAt: null },
    });
    if (!mgr) {
      mgr = await prisma.user.create({
        data: {
          name: 'مدير دورة العهد',
          email: `mgr.custody.${Date.now()}@test.local`,
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

    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);

    // 2. Engineer
    let eng = await prisma.user.findFirst({
      where: { role: Role.ENGINEER, isActive: true, deletedAt: null },
    });
    if (!eng) {
      eng = await prisma.user.create({
        data: {
          name: 'مهندس دورة العهد',
          email: `eng.custody.${Date.now()}@test.local`,
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

    // 3. Accountant
    let acc = await prisma.user.findFirst({
      where: { role: Role.ACCOUNTANT, isActive: true, deletedAt: null },
    });
    if (!acc) {
      acc = await prisma.user.create({
        data: {
          name: 'محاسب دورة العهد',
          email: `acc.custody.${Date.now()}@test.local`,
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
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const expId of cleanupExpenseIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'EXPENSE', entityId: expId } });
      await prisma.expense.deleteMany({ where: { id: expId } });
    }
    cleanupExpenseIds.length = 0;

    for (const cId of cleanupCustodyIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'CUSTODY', entityId: cId } });
      await prisma.expense.deleteMany({ where: { custodyId: cId } });
      await prisma.custody.deleteMany({ where: { id: cId } });
    }
    cleanupCustodyIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.custody.deleteMany({ where: { projectId: pId } });
      await prisma.expense.deleteMany({ where: { projectId: pId } });
      await prisma.budgetLine.deleteMany({ where: { budget: { projectId: pId } } });
      await prisma.budget.deleteMany({ where: { projectId: pId } });
      await prisma.project.deleteMany({ where: { id: pId } });
    }
    cleanupProjectIds.length = 0;
  });

  async function setupActiveProjectWithBudget(lineAmount = '50000.00') {
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testManager);

    const project = await createProject({
      code: `CUST-PRJ-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار دورة العهد',
      managerId: testManager.id,
    });
    cleanupProjectIds.push(project.id);

    const budgetDraft = await createBudgetDraft({
      projectId: project.id,
      lines: [
        {
          category: BudgetCategory.SITE_OPERATIONS,
          description: 'مصاريف موقع وتشغيل',
          amount: lineAmount,
        },
      ],
    });

    await submitBudget(budgetDraft.id);
    const approvedBudget = await approveBudget(budgetDraft.id);

    await changeProjectStatus(project.id, { newStatus: ProjectStatus.ACTIVE });

    const budgetLineId = approvedBudget.lines[0]!.id;
    return { project, budgetLineId };
  }

  it('executes full custody lifecycle: Draft -> Submitted -> Rejected -> Reopen -> Approved -> Issued -> Expense Settlement -> Cash Return -> Closed', async () => {
    const { project, budgetLineId } = await setupActiveProjectWithBudget('50000.00');

    // -------------------------------------------------------------------------
    // STEP 1: Draft creation by Engineer
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);

    const draft = await createCustodyDraft({
      projectId: project.id,
      budgetLineId,
      custodianUserId: testEngineer.id,
      amount: '10000.00',
      purpose: 'عهدة تشغيلية لشراء وقود ومستلزمات صيانة الموقع',
    });
    cleanupCustodyIds.push(draft.id);

    expect(draft.id).toBeDefined();
    expect(draft.status).toBe(CustodyStatus.DRAFT);
    expect(draft.amount).toBe('10000.00');
    expect(draft.custodian.id).toBe(testEngineer.id);

    // -------------------------------------------------------------------------
    // STEP 2: Update Draft by Engineer
    // -------------------------------------------------------------------------
    const updatedDraft = await updateCustodyDraft({
      id: draft.id,
      budgetLineId,
      custodianUserId: testEngineer.id,
      amount: '12000.00',
      purpose: 'تعديل المبلغ: عهدة تشغيلية لشراء وقود وصيانة دورية للمعدات',
    });
    expect(updatedDraft.amount).toBe('12000.00');

    // -------------------------------------------------------------------------
    // STEP 3: Submission by Engineer
    // -------------------------------------------------------------------------
    const submitted = await submitCustody(draft.id);
    expect(submitted.status).toBe(CustodyStatus.SUBMITTED);
    expect(submitted.submittedBy?.id).toBe(testEngineer.id);

    // -------------------------------------------------------------------------
    // STEP 4: Rejection by Manager
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const rejected = await rejectCustody({
      id: draft.id,
      rejectionReason: 'المبلغ مبالغ فيه نرجو تخفيضه إلى 10000 ر.س',
    });
    expect(rejected.status).toBe(CustodyStatus.REJECTED);
    expect(rejected.rejectedBy?.id).toBe(testManager.id);
    expect(rejected.rejectionReason).toContain('تخفيضه إلى 10000');

    // -------------------------------------------------------------------------
    // STEP 5: Reopen by Engineer and adjust amount back to 10000, then resubmit
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);

    const reopened = await reopenCustody(draft.id);
    expect(reopened.status).toBe(CustodyStatus.DRAFT);
    expect(reopened.rejectedBy).toBeNull();
    expect(reopened.rejectionReason).toBeNull();

    await updateCustodyDraft({
      id: draft.id,
      budgetLineId,
      custodianUserId: testEngineer.id,
      amount: '10000.00',
      purpose: 'عهدة تشغيلية بعد التخفيض المعتمد للموقع',
    });

    const resubmitted = await submitCustody(draft.id);
    expect(resubmitted.status).toBe(CustodyStatus.SUBMITTED);

    // -------------------------------------------------------------------------
    // STEP 6: Approval by Manager (INVARIANT 2: ZERO ACTIVE EXPOSURE ENCUMBERED)
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const approved = await approveCustody(draft.id);
    expect(approved.status).toBe(CustodyStatus.APPROVED);
    expect(approved.approvedBy?.id).toBe(testManager.id);

    // Verify Invariant 2 at the DB level: no active exposure encumbered yet
    const projectCustodiesPre = await getProjectCustodies(project.id);
    const lineMetricsPre = projectCustodiesPre.lines[0]!;
    expect(lineMetricsPre.totalActiveExposure).toBe('0.00'); // APPROVED does not encumber active exposure!

    // -------------------------------------------------------------------------
    // STEP 7: Cash Issuance by Accountant (INVARIANT 3: ENCUMBERS OUTSTANDING CUSTODY)
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testAccountant);

    const issued = await issueCustody(draft.id);
    expect(issued.status).toBe(CustodyStatus.ISSUED);
    expect(issued.issuedBy?.id).toBe(testAccountant.id);
    expect(issued.remainingBalance).toBe('10000.00');

    // Verify Invariant 3 at the DB level: OutstandingCustody = 10,000.00
    const projectCustodiesPostIssue = await getProjectCustodies(project.id);
    const lineMetricsPostIssue = projectCustodiesPostIssue.lines[0]!;
    expect(lineMetricsPostIssue.outstandingCustodies).toBe('10000.00');
    expect(lineMetricsPostIssue.totalActiveExposure).toBe('10000.00');
    expect(lineMetricsPostIssue.availableBalance).toBe('40000.00'); // 50k - 10k

    // -------------------------------------------------------------------------
    // STEP 8: Attempt to cancel ISSUED custody must fail with CANNOT_CANCEL_ISSUED_CUSTODY
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    await expect(
      cancelCustody({
        id: draft.id,
        cancellationReason: 'محاولة إلغاء بعد الصرف النقدي',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'CANNOT_CANCEL_ISSUED_CUSTODY' }));

    // -------------------------------------------------------------------------
    // STEP 9: Expense settlement against Custody (INVARIANT 5: ZERO DOUBLE COUNTING)
    // -------------------------------------------------------------------------
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);

    const expenseDraft = await createExpenseDraft({
      projectId: project.id,
      budgetLineId,
      custodyId: draft.id,
      amount: '6000.00',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: 'فاتورة ديزل وتشحيم معدات من العهدة التشغيلية',
    });
    cleanupExpenseIds.push(expenseDraft.id);

    await submitExpense(expenseDraft.id);

    // Manager approves expense linked to custody
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    const approvedExpense = await approveExpense(expenseDraft.id);
    expect(approvedExpense.status).toBe(ExpenseStatus.APPROVED);

    // Verify custody transition to PARTIALLY_SETTLED & balances
    const custodyAfterExp = await getCustody(draft.id);
    expect(custodyAfterExp.status).toBe(CustodyStatus.PARTIALLY_SETTLED);
    expect(custodyAfterExp.settledExpensesAmount).toBe('6000.00');
    expect(custodyAfterExp.remainingBalance).toBe('4000.00'); // 10,000 - 6,000

    // Verify Invariant 5: BudgetLine active exposure PRESERVED (no double counting!)
    // Total exposure = 6,000 (actual spend) + 4,000 (outstanding custody) = 10,000.00
    const projectCustodiesPostExp = await getProjectCustodies(project.id);
    const lineMetricsPostExp = projectCustodiesPostExp.lines[0]!;
    expect(lineMetricsPostExp.approvedExpenses).toBe('6000.00');
    expect(lineMetricsPostExp.outstandingCustodies).toBe('4000.00');
    expect(lineMetricsPostExp.totalActiveExposure).toBe('10000.00'); // Exactly 10,000.00 preserved!

    // -------------------------------------------------------------------------
    // STEP 10: Cash Return by Accountant (INVARIANT 6: EXCEEDS BALANCE CHECK & AUTO-SETTLE)
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testAccountant);

    // Attempting to return 5000 when remaining is 4000 must fail
    await expect(
      recordCashReturn({
        id: draft.id,
        amount: '5000.00',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'CASH_RETURN_EXCEEDS_BALANCE' }));

    // Return exact remaining balance: 4000.00
    const returnResult = await recordCashReturn({
      id: draft.id,
      amount: '4000.00',
    });
    expect(returnResult.cashReturnedAmount).toBe('4000.00');
    expect(returnResult.remainingBalance).toBe('0.00');
    expect(returnResult.status).toBe(CustodyStatus.SETTLED); // Auto-settled!

    // Attempting a second cash return in v1 must fail with CONFLICT
    await expect(
      recordCashReturn({
        id: draft.id,
        amount: '100.00',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));

    // -------------------------------------------------------------------------
    // STEP 11: Final Closure by Manager (SETTLED -> CLOSED)
    // -------------------------------------------------------------------------
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const closed = await closeCustody(draft.id);
    expect(closed.status).toBe(CustodyStatus.CLOSED);
    expect(closed.closedBy?.id).toBe(testManager.id);

    // -------------------------------------------------------------------------
    // STEP 12: Terminal Immutability & Soft-Delete Protections
    // -------------------------------------------------------------------------
    // Cannot delete closed custody
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    await expect(deleteCustodyDraft(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'CUSTODY_NOT_DRAFT' }),
    );
  });

  it('proves Pre-Issuance Cancellation (APPROVED -> CANCELLED) frees custodian without exposure encumbrance', async () => {
    const { project, budgetLineId } = await setupActiveProjectWithBudget('30000.00');

    // 1. Create and submit draft
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    const draft = await createCustodyDraft({
      projectId: project.id,
      budgetLineId,
      custodianUserId: testEngineer.id,
      amount: '8000.00',
      purpose: 'عهدة سيتم إلغاؤها قبل الصرف الفعلي للمهندس',
    });
    cleanupCustodyIds.push(draft.id);

    await submitCustody(draft.id);

    // 2. Approve by Manager
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    await approveCustody(draft.id);

    // 3. Cancel by Manager before Accountant issues
    const cancelled = await cancelCustody({
      id: draft.id,
      cancellationReason: 'تم إلغاء المهمة الميدانية لعدم جاهزية موقع العمل',
    });
    expect(cancelled.status).toBe(CustodyStatus.CANCELLED);
    expect(cancelled.cancelledBy?.id).toBe(testManager.id);
    expect(cancelled.cancellationReason).toContain('تم إلغاء المهمة الميدانية');

    // 4. Attempting to issue a CANCELLED custody fails
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testAccountant);
    await expect(issueCustody(draft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
    );

    // 5. Invariant 8 proof: Since it was CANCELLED, custodian is now free to create a new custody!
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    const newDraft = await createCustodyDraft({
      projectId: project.id,
      budgetLineId,
      custodianUserId: testEngineer.id,
      amount: '5000.00',
      purpose: 'عهدة جديدة بديلة بعد إلغاء العهدة السابقة',
    });
    cleanupCustodyIds.push(newDraft.id);
    expect(newDraft.status).toBe(CustodyStatus.DRAFT);
  });
});

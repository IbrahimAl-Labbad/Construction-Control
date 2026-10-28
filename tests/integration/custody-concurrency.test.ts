/**
 * tests/integration/custody-concurrency.test.ts
 *
 * Concurrency & Race Condition Integration Tests on live PostgreSQL:
 *
 * Race 1: Concurrent Expense Settlement against Shared Custody Envelope
 * - Seed Custody issued for 5,000.00 SAR.
 * - Seed two SUBMITTED Expenses of 3,500.00 SAR each (total = 7,000.00 SAR > 5,000.00 SAR).
 * - Concurrently approve both expenses in parallel.
 * - Proves Custody row-locking (SELECT ... FOR UPDATE) serializes.
 * - Exactly one approval succeeds, one fails with CUSTODY_BALANCE_EXCEEDED.
 * - Verifies custody remaining balance is strictly 1,500.00 SAR.
 *
 * Race 2: Concurrent Custody Issuance vs Commitment Approval on Shared BudgetLine
 * - Seed BudgetLine with 10,000.00 SAR authorized amount.
 * - Seed one SUBMITTED Commitment of 7,000.00 SAR.
 * - Seed one APPROVED Custody of 7,000.00 SAR awaiting issuance.
 * - (Total exposure requested = 14,000.00 SAR > 10,000.00 SAR ceiling).
 * - Concurrently dispatch approveCommitment and issueCustody in parallel.
 * - Proves BudgetLine row-level locking (SELECT ... FOR UPDATE) serializes across domains.
 * - Exactly one succeeds, other fails with BUDGET_LINE_EXCEEDED.
 * - Proves total exposure in DB <= 10,000.00 SAR.
 *
 * Race 3: Invariant 8 Concurrent Creation/Submission (Database Partial Unique Index)
 * - Proves PostgreSQL partial unique index `unique_active_custody_per_custodian` prevents
 *   concurrent creation of two active custodies for the same custodian on the same project.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Role, ProjectStatus, BudgetCategory, CustodyStatus, ExpenseStatus, CommitmentStatus, AssignmentStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  createCustodyDraft,
  submitCustody,
  approveCustody,
  issueCustody,
  recordCashReturn,
  closeCustody,
  getCustody,
} from '@/lib/custodies';
import { createExpenseDraft, submitExpense, approveExpense } from '@/lib/expenses';
import { createCommitmentDraft, submitCommitment, approveCommitment } from '@/lib/commitments';
import { createProject, changeProjectStatus } from '@/lib/projects';
import { createBudgetDraft, submitBudget, approveBudget } from '@/lib/budget';
import * as permissions from '@/lib/permissions';
import * as auth from '@/lib/auth/session';
import type { AuthenticatedUser } from '@/lib/auth/types';

describe('Custody Concurrency & Race Conditions (Live PostgreSQL)', () => {
  let testManager: AuthenticatedUser;
  let testEngineer: AuthenticatedUser;
  let testAccountant: AuthenticatedUser;
  let testPurchasing: AuthenticatedUser;

  const cleanupProjectIds: string[] = [];
  const cleanupCustodyIds: string[] = [];
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
          name: 'مدير سباقات العهد',
          email: `mgr.cust.race.${Date.now()}@test.local`,
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
          name: 'مهندس سباقات العهد',
          email: `eng.cust.race.${Date.now()}@test.local`,
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
          name: 'محاسب سباقات العهد',
          email: `acc.cust.race.${Date.now()}@test.local`,
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

    // 4. Purchasing
    let pur = await prisma.user.findFirst({
      where: { role: Role.PURCHASING, isActive: true, deletedAt: null },
    });
    if (!pur) {
      pur = await prisma.user.create({
        data: {
          name: 'مسؤول مشتريات سباقات العهد',
          email: `pur.cust.race.${Date.now()}@test.local`,
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

    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
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

    for (const cId of cleanupCustodyIds) {
      await prisma.auditLog.deleteMany({ where: { entityType: 'CUSTODY', entityId: cId } });
      await prisma.expense.deleteMany({ where: { custodyId: cId } });
      await prisma.custody.deleteMany({ where: { id: cId } });
    }
    cleanupCustodyIds.length = 0;

    for (const pId of cleanupProjectIds) {
      await prisma.projectAssignment.deleteMany({ where: { projectId: pId } });
      await prisma.custody.deleteMany({ where: { projectId: pId } });
      await prisma.expense.deleteMany({ where: { projectId: pId } });
      await prisma.commitment.deleteMany({ where: { projectId: pId } });
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
      code: `CUST-RACE-${Math.floor(Math.random() * 89999 + 10000)}`,
      name: 'مشروع اختبار سباق العهد',
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

    await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        engineerId: testEngineer.id,
        assignedById: testManager.id,
        status: AssignmentStatus.ACTIVE,
      },
    });

    const budgetLineId = approvedBudget.lines[0]!.id;
    return { project, budgetLineId };
  }

  it('Race 1: Concurrent expense approvals against custody envelope serialize and prevent overspending', async () => {
    // Budget line = 20,000.00 SAR
    const { project, budgetLineId } = await setupActiveProjectWithBudget('20000.00');

    // 1. Setup an ISSUED custody of 5,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    const custodyDraft = await createCustodyDraft({
      projectId: project.id,
      budgetLineId,
      custodianUserId: testEngineer.id,
      amount: '5000.00',
      purpose: 'عهدة لاختبار سباق استهلاك المبالغ',
    });
    cleanupCustodyIds.push(custodyDraft.id);

    await submitCustody(custodyDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    await approveCustody(custodyDraft.id);

    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testAccountant);
    await issueCustody(custodyDraft.id);

    // 2. Engineer creates two expenses of 3,500.00 SAR each against this custody
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);

    const exp1 = await createExpenseDraft({
      projectId: project.id,
      budgetLineId,
      custodyId: custodyDraft.id,
      amount: '3500.00',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: 'مصروف سباق أ',
    });
    cleanupExpenseIds.push(exp1.id);
    await submitExpense(exp1.id);

    const exp2 = await createExpenseDraft({
      projectId: project.id,
      budgetLineId,
      custodyId: custodyDraft.id,
      amount: '3500.00',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: 'مصروف سباق ب',
    });
    cleanupExpenseIds.push(exp2.id);
    await submitExpense(exp2.id);

    // 3. Dispatch concurrent approvals as Manager in parallel
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const results = await Promise.allSettled([
      approveExpense(exp1.id),
      approveExpense(exp2.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed and one must fail
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason.code).toBe('CUSTODY_BALANCE_EXCEEDED');

    // 4. Verify in DB: remaining balance is exactly 1,500.00 SAR
    const updatedCustody = await getCustody(custodyDraft.id);
    expect(updatedCustody.settledExpensesAmount).toBe('3500.00');
    expect(updatedCustody.remainingBalance).toBe('1500.00');
  });

  it('Race 2: Concurrent Custody Issuance vs Commitment Approval on shared BudgetLine respects ceiling', async () => {
    // Budget line = 10,000.00 SAR
    const { project, budgetLineId } = await setupActiveProjectWithBudget('10000.00');

    // 1. Purchasing creates a commitment of 7,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testPurchasing);
    const commDraft = await createCommitmentDraft({
      projectId: project.id,
      budgetLineId,
      vendorName: 'شركة التوريدات المتحدة',
      amount: '7000.00',
      commitmentDate: new Date(),
      description: 'التزام توريد سباق',
    });
    cleanupCommitmentIds.push(commDraft.id);
    await submitCommitment(commDraft.id);

    // 2. Engineer creates a custody of 7,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    const custodyDraft = await createCustodyDraft({
      projectId: project.id,
      budgetLineId,
      custodianUserId: testEngineer.id,
      amount: '7000.00',
      purpose: 'عهدة موقع سباق',
    });
    cleanupCustodyIds.push(custodyDraft.id);
    await submitCustody(custodyDraft.id);

    // 3. Manager approves custody (Invariant 2: zero exposure encumbered yet!)
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    await approveCustody(custodyDraft.id);

    // Now:
    // - Commitment is SUBMITTED (7,000 SAR) awaiting Manager approval
    // - Custody is APPROVED (7,000 SAR) awaiting Accountant issuance
    // Both together = 14,000 SAR > 10,000 SAR line ceiling!

    // 4. Concurrently execute approveCommitment (Manager) and issueCustody (Accountant)
    const runApproveCommitment = async () => {
      vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
      return approveCommitment(commDraft.id);
    };

    const runIssueCustody = async () => {
      vi.spyOn(permissions, 'requireRole').mockResolvedValue(testAccountant);
      return issueCustody(custodyDraft.id);
    };

    const results = await Promise.allSettled([
      runApproveCommitment(),
      runIssueCustody(),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one succeeds, one fails with BUDGET_LINE_EXCEEDED
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason.code).toBe('BUDGET_LINE_EXCEEDED');

    // 5. Verify live DB state: total active exposure <= 10,000.00 SAR (strictly 7,000.00 SAR)
    const commDb = await prisma.commitment.findUniqueOrThrow({ where: { id: commDraft.id } });
    const custDb = await prisma.custody.findUniqueOrThrow({ where: { id: custodyDraft.id } });

    if (commDb.status === CommitmentStatus.APPROVED) {
      expect(custDb.status).toBe(CustodyStatus.APPROVED); // not issued!
    } else {
      expect(commDb.status).toBe(CommitmentStatus.SUBMITTED);
      expect(custDb.status).toBe(CustodyStatus.ISSUED);
    }
  });

  it('Race 3: Invariant 8 concurrent submission is stopped by PostgreSQL partial unique index', async () => {
    const { project, budgetLineId } = await setupActiveProjectWithBudget('20000.00');

    // Create two separate drafts for the same custodian on the same project
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);

    // Direct insert of second draft via prisma (since createCustodyDraft application check allows drafts, but not multiple active)
    const draft1 = await prisma.custody.create({
      data: {
        code: `CUST-T1-${Date.now().toString().slice(-4)}`,
        projectId: project.id,
        budgetLineId,
        custodianUserId: testEngineer.id,
        createdById: testEngineer.id,
        amount: new Prisma.Decimal('2000.00'),
        purpose: 'مسودة اختبار سباق 1',
        status: CustodyStatus.DRAFT,
      },
    });
    cleanupCustodyIds.push(draft1.id);

    const draft2 = await prisma.custody.create({
      data: {
        code: `CUST-T2-${Date.now().toString().slice(-4)}`,
        projectId: project.id,
        budgetLineId,
        custodianUserId: testEngineer.id,
        createdById: testEngineer.id,
        amount: new Prisma.Decimal('3000.00'),
        purpose: 'مسودة اختبار سباق 2',
        status: CustodyStatus.DRAFT,
      },
    });
    cleanupCustodyIds.push(draft2.id);

    // Concurrently submit both drafts in parallel
    const results = await Promise.allSettled([
      submitCustody(draft1.id),
      submitCustody(draft2.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one succeeds, one is rejected
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Check DB state: exactly 1 custody is SUBMITTED
    const activeCount = await prisma.custody.count({
      where: {
        projectId: project.id,
        custodianUserId: testEngineer.id,
        status: CustodyStatus.SUBMITTED,
        deletedAt: null,
      },
    });
    expect(activeCount).toBe(1);
  });

  it('Race B (Slice 21A): submitExpense vs custody settlement/closeCustody never leaves a SUBMITTED expense attached to a CLOSED custody', async () => {
    const { project, budgetLineId } = await setupActiveProjectWithBudget('20000.00');

    // 1. Setup an ISSUED custody of 5,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    const custodyDraft = await createCustodyDraft({
      projectId: project.id,
      budgetLineId,
      custodianUserId: testEngineer.id,
      amount: '5000.00',
      purpose: 'عهدة اختبار سباق التقديم والإغلاق',
    });
    cleanupCustodyIds.push(custodyDraft.id);

    await submitCustody(custodyDraft.id);

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    await approveCustody(custodyDraft.id);

    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testAccountant);
    vi.spyOn(permissions, 'requireAccountant').mockResolvedValue(testAccountant);
    await issueCustody(custodyDraft.id);

    // 2. Engineer creates two DRAFT expenses attached to this custody while it is ISSUED
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);

    const draftSubmitsFirst = await createExpenseDraft({
      projectId: project.id,
      budgetLineId,
      custodyId: custodyDraft.id,
      amount: '1000.00',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: 'مصروف يقدم قبل الإغلاق',
    });
    cleanupExpenseIds.push(draftSubmitsFirst.id);

    const draftSubmitsAfterClose = await createExpenseDraft({
      projectId: project.id,
      budgetLineId,
      custodyId: custodyDraft.id,
      amount: '1000.00',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: 'مصروف يحاول التقديم أثناء/بعد التسوية والإغلاق',
    });
    cleanupExpenseIds.push(draftSubmitsAfterClose.id);

    // Sub-case B1: Expense submission commits first while custody is ISSUED, then cash return settles the custody,
    // and Manager attempts closeCustody -> closeCustody must refuse with CUSTODY_HAS_PENDING_EXPENSES.
    await submitExpense(draftSubmitsFirst.id);

    vi.spyOn(permissions, 'requireAccountant').mockResolvedValue(testAccountant);
    await recordCashReturn({ id: custodyDraft.id, amount: '5000.00' });

    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    await expect(closeCustody(custodyDraft.id)).rejects.toThrow(
      expect.objectContaining({ code: 'CUSTODY_HAS_PENDING_EXPENSES' }),
    );

    // Sub-case B2: Once no SUBMITTED expense remains (e.g., rejected) and custody is SETTLED,
    // racing closeCustody against submitExpense of another draft must serialize under the custody lock:
    // closeCustody succeeds and submitExpense rejects with CUSTODY_NOT_ISSUED.
    await prisma.expense.update({
      where: { id: draftSubmitsFirst.id },
      data: { status: ExpenseStatus.REJECTED, rejectedById: testManager.id, rejectedAt: new Date(), rejectionReason: 'رفض لإغلاق العهدة' },
    });

    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const [closeResult, lateSubmitResult] = await Promise.allSettled([
      closeCustody(custodyDraft.id),
      submitExpense(draftSubmitsAfterClose.id),
    ]);

    expect(closeResult.status).toBe('fulfilled');
    expect(lateSubmitResult.status).toBe('rejected');
    expect((lateSubmitResult as PromiseRejectedResult).reason.code).toBe('CUSTODY_NOT_ISSUED');

    // Invariant verification: Custody is CLOSED and has ZERO SUBMITTED child expenses
    const finalCustody = await prisma.custody.findUniqueOrThrow({ where: { id: custodyDraft.id } });
    expect(finalCustody.status).toBe(CustodyStatus.CLOSED);

    const submittedOnClosedCount = await prisma.expense.count({
      where: { custodyId: custodyDraft.id, status: ExpenseStatus.SUBMITTED, deletedAt: null },
    });
    expect(submittedOnClosedCount).toBe(0);
  });

  it('Race C (Slice 21A): submitExpense is advisory and non-reserving while approveExpense enforces authoritative custody balance under lock', async () => {
    const { project, budgetLineId } = await setupActiveProjectWithBudget('20000.00');

    // 1. Setup an ISSUED custody of 5,000.00 SAR
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);
    const custodyDraft = await createCustodyDraft({
      projectId: project.id,
      budgetLineId,
      custodianUserId: testEngineer.id,
      amount: '5000.00',
      purpose: 'عهدة اختبار التقديم الاستشاري غير الحاجز',
    });
    cleanupCustodyIds.push(custodyDraft.id);

    await submitCustody(custodyDraft.id);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);
    await approveCustody(custodyDraft.id);
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testAccountant);
    vi.spyOn(permissions, 'requireAccountant').mockResolvedValue(testAccountant);
    await issueCustody(custodyDraft.id);

    // 2. Engineer creates two drafts of 4,000.00 SAR each and one draft of 6,000.00 SAR (> 5,000.00 SAR)
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireAuth').mockResolvedValue(testEngineer);
    vi.spyOn(permissions, 'requireRole').mockResolvedValue(testEngineer);

    const draftA = await createExpenseDraft({
      projectId: project.id,
      budgetLineId,
      custodyId: custodyDraft.id,
      amount: '4000.00',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: 'مصروف استشاري أول 4000',
    });
    cleanupExpenseIds.push(draftA.id);

    const draftB = await createExpenseDraft({
      projectId: project.id,
      budgetLineId,
      custodyId: custodyDraft.id,
      amount: '4000.00',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: 'مصروف استشاري ثان 4000',
    });
    cleanupExpenseIds.push(draftB.id);

    const draftOver = await createExpenseDraft({
      projectId: project.id,
      budgetLineId,
      custodyId: custodyDraft.id,
      amount: '6000.00',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: 'مصروف يتجاوز الرصيد الكلي 6000',
    });
    cleanupExpenseIds.push(draftOver.id);

    // 3. Concurrently submit draftA (4,000) and draftB (4,000): both succeed because submission is non-reserving!
    // Meanwhile draftOver (6,000 > 5,000 remaining) is rejected by the advisory check.
    const [subA, subB, subOver] = await Promise.allSettled([
      submitExpense(draftA.id),
      submitExpense(draftB.id),
      submitExpense(draftOver.id),
    ]);

    expect(subA.status).toBe('fulfilled');
    expect(subB.status).toBe('fulfilled');
    expect(subOver.status).toBe('rejected');
    expect((subOver as PromiseRejectedResult).reason.code).toBe('CUSTODY_BALANCE_EXCEEDED');

    // 4. Authoritative approval gate: concurrently approving draftA and draftB allows only one (4,000 <= 5,000)
    vi.spyOn(auth, 'requireAuth').mockResolvedValue(testManager);
    vi.spyOn(permissions, 'requireManager').mockResolvedValue(testManager);

    const [appA, appB] = await Promise.allSettled([
      approveExpense(draftA.id),
      approveExpense(draftB.id),
    ]);

    const approvedList = [appA, appB].filter((r) => r.status === 'fulfilled');
    const rejectedList = [appA, appB].filter((r) => r.status === 'rejected');

    expect(approvedList).toHaveLength(1);
    expect(rejectedList).toHaveLength(1);
    expect((rejectedList[0] as PromiseRejectedResult).reason.code).toBe('CUSTODY_BALANCE_EXCEEDED');
  });
});
